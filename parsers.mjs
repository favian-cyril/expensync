import { Configuration, OpenAIApi } from 'openai';
import { getDecimalValue, findAllMoneyValues, findHighestCount, normalizeCurrencyValue, getDecimalValueWithCurrency } from './utils.mjs';

export async function parseEmailChatgpt ({ categories, textHtml, emailId, emailCreated, currency, saveEmail = true }) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  const newLineRegex = /(\r\n|\n)/g;
  const strippedText = textHtml.replace(newLineRegex, ' ');
  // TODO: Add case for empty categories
  const categoryString = categories.reduce((acc, cur) => acc + ', ' + cur.value, '');
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          "role": "system",
          "content": `You are tasked with classifying and summarizing receipts from emails, reply without explanation the total amount,currency code,datetime paid,category,vendor. For Category choose from these categories: ${categoryString}. If category is not available use null instead. datetime should be in iso format. If the content isn't a transaction reply with null`
        },
      {
        role: "user",
        content: strippedText
      }],
      temperature: 0.2
    });
    if (completion.data.choices.length) {
      const regex = /:\s+([^\n\r]+)/gm
      console.log('ChatGPT response: ', completion.data.choices[0].message.content);
      if (completion.data.choices[0].message.content === 'null') throw new Error('Email isnt a transaction');
      const [amountStr, currencySymbol, datetime, category, vendor] = [...completion.data.choices[0].message.content.matchAll(regex)].map(res => res[1]);
      if (amountStr === 'null') throw new Error('Amount is null');
      const catObj = categories.find(cat => cat.value.toUpperCase() === category.toUpperCase());
      const { amount, decimal } = getDecimalValueWithCurrency(amountStr);
      const normalizedValue = normalizeCurrencyValue(decimal, currency.exponent, amount)
      const otherValues = findAllMoneyValues(textHtml, currencySymbol);
      function normalizeValues (val) {
        const decimalVal = getDecimalValue(val);
        return normalizeCurrencyValue(decimalVal.decimal, currency.exponent, decimalVal.amount)
      }
      const email_created = new Date(emailCreated) === 'Invalid Date' ? datetime : emailCreated;
      const other_amounts = otherValues.map(normalizeValues);
      return {
        email_id: emailId,
        email_created,
        vendor,
        email_content: saveEmail ? textHtml : null,
        amount: normalizedValue,
        other_amounts,
        currency: currency.code,
        category_id: catObj ? catObj?.uuid : null,
        token_size: completion.data.usage.total_tokens,
        parser: 'gpt-3.5-turbo',
        currency_decimal: currency.exponent
      };
    }
  } catch (e) {
    console.error('ChatGPT Error:', e);
    return null;
  }
}

export function manualParseEmail ({
  emailBody,
  currencySymbol,
  currencyCode,
  emailId,
  emailCreated,
  currency,
  saveEmail = true,
}) {
  const match = findAllMoneyValues(emailBody, currencySymbol);
  if (match) {
    // Assume all values use the same decimal place
    const decimal = getDecimalValue(match[0]).decimal;
    const intValues = match.map(i => getDecimalValue(i).amount);
    // Try to get total amount by getting highest count value, and getting the bigger value
    const estimatedAmount = findHighestCount(intValues);
    const normalizedValue = normalizeCurrencyValue(decimal, currency.exponent, estimatedAmount)
    const other_amounts = intValues.map(i => normalizeCurrencyValue(decimal, currency.exponent, i));
    return {
      email_id: emailId,
      email_created: emailCreated,
      email_content: saveEmail ? emailBody : null,
      amount: normalizedValue,
      other_amounts: other_amounts,
      currency: currencyCode,
      currency_decimal: currency.exponent,
    };
  } else {
    return null;
  }
}