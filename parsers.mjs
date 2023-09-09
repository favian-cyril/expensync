import { Configuration, OpenAIApi } from 'openai';
import { getDecimalValue, findAllMoneyValues, findHighestCount, normalizeCurrencyValue } from './utils.mjs';
import * as currencies from '@dinero.js/currencies'

export async function parseEmailChatgpt (categories, textHtml, emailId, emailCreated, currencyCode) {
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
          "content": `You are tasked with classifying and summarizing receipts from emails, reply without explanation in this format only without heading: Total|Currency Code|Category|Vendor. For Category choose from these categories: ${categoryString}. If category is not available use null instead.`
        },
      {
        role: "user",
        content: strippedText
      }],
      temperature: 0.2
    });
    if (completion.data.choices.length) {
      const [amountStr, currencySymbol, category, vendor] = completion.data.choices[0].message.content.split('|');
      console.log('ChatGPT response: ', completion.data.choices[0].message.content);
      if (parseInt(amountStr) === NaN) throw new Error('Amount is null');
      // TODO: Change when db returns the currency object
      const currencyRef = currencies[currencyCode];
      const catObj = categories.find(cat => cat.value.toUpperCase() === category.toUpperCase());
      const { amount, decimal } = getDecimalValue(amountStr);
      const normalizedValue = normalizeCurrencyValue(decimal, currencyRef.exponent, amount)
      const otherValues = findAllMoneyValues(textHtml, currencySymbol);
      function normalizeValues (val) {
        const decimalVal = getDecimalValue(val);
        return normalizeCurrencyValue(decimalVal.decimal, currencyRef.exponent, decimalVal.amount)
      }
      const other_amounts = otherValues.map(normalizeValues);
      return {
        email_id: emailId,
        email_created: emailCreated,
        vendor,
        email_content: textHtml,
        amount: normalizedValue,
        other_amounts,
        currency: currencyCode,
        category_id: catObj ? catObj?.uuid : null,
        token_size: completion.data.usage.total_tokens,
        parser: 'gpt-3.5-turbo',
        currency_decimal: currencyRef.exponent
      };
    }
  } catch (e) {
    console.error('ChatGPT Error:', e);
    return null;
  }
}

export function manualParseEmail (
  emailBody,
  currencySymbol,
  currencyCode,
  emailId,
  emailCreated
) {
  const match = findAllMoneyValues(emailBody, currencySymbol);
  if (match) {
    // Assume all values use the same decimal place
    const decimal = getDecimalValue(match[0]).decimal;
    const intValues = match.map(i => getDecimalValue(i).amount);
    // Try to get total amount by getting highest count value, and getting the bigger value
    const currencyRef = currencies[currencyCode];
    const estimatedAmount = findHighestCount(intValues);
    const normalizedValue = normalizeCurrencyValue(decimal, currencyRef.exponent, estimatedAmount)
    const other_amounts = intValues.map(i => normalizeCurrencyValue(decimal, currencyRef.exponent, i));
    return {
      email_id: emailId,
      email_created: emailCreated,
      email_content: emailBody,
      amount: normalizedValue,
      other_amounts: other_amounts,
      currency: currencyCode,
      currency_decimal: currencyRef.exponent,
    };
  } else {
    return null;
  }
}