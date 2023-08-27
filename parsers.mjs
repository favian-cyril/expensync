import { Configuration, OpenAIApi } from 'openai';
import { getDecimalValue, findAllMoneyValues, findHighestCount, normalizeCurrencyValue } from './utils.mjs';
import { IDR } from '@dinero.js/currencies'

export async function parseEmailChatgpt (categories, textHtml, emailId, emailCreated, currencySymbol, currencyCode) {
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
          "content": `You are tasked with classifying and summarizing receipts from emails, reply without explanation in this format only: Total|Category|Summary. For Category choose from these categories: ${categoryString}. If category is not available use null instead. If the email doesn't seem to be a receipt reply with null instead`
        },
      {
        role: "user",
        content: strippedText
      }],
      temperature: 0.2
    });
    if (completion.data.choices.length) {
      if (completion.data.choices[0].message.content.toUpperCase() === 'NULL') {
        console.error('Not a receipt');
        return null;
      }
      const [amountStr, category, summary] = completion.data.choices[0].message.content.split('|');
      const currencyRef = await import(`@dinero.js/currencies/dist/esm/iso4217/amendments/168/${currencyCode.toLowerCase()}.js`);
      console.log('ChatGPT response: ', completion.data.choices[0].message.content);
      console.log('Currency: ', currencyRef);
      const catObj = categories.find(cat => cat.value === category);
      const { amount, decimal } = getDecimalValue(amountStr);
      const normalizedValue = normalizeCurrencyValue(decimal, currencyRef.exponent, amount)
      const otherValues = findAllMoneyValues(textHtml, currencySymbol) || [];
      const other_amounts = otherValues.map(i => normalizeCurrencyValue(decimal, currencyRef.exponent, getDecimalValue(i).amount));
      return {
        email_id: emailId,
        email_created: emailCreated,
        summary,
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
    const estimatedAmount = findHighestCount(intValues);
    return {
      email_id: emailId,
      email_created: emailCreated,
      summary,
      email_content: emailBody,
      amount: estimatedAmount,
      other_amounts: floatValues,
      currency: currencyCode,
      currency_decimal: decimal,
    };
  } else {
    return null;
  }
}