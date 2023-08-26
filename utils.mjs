export function findHighestCount(numbers) {
  const counts = new Map();

  for (const number of numbers) {
    counts.set(number, (counts.get(number) || 0) + 1);
  }

  let maxCount = 0;
  let maxValue = -Infinity;

  for (const [number, count] of counts.entries()) {
    if (count > maxCount || (count === maxCount && number > maxValue)) {
      maxCount = count;
      maxValue = number;
    }
  }

  return maxValue;
}

export function isDotSeparated (stringValue) {
  // Test if the moneyString contains dots as the thousand separator
  const dotRegex = /^\d{1,3}(\.\d{3})*(,\d{2})?$/;
  return dotRegex.test(stringValue)
}

// function isCommaSeparated (stringValue) {
//   // Test if the moneyString contains commas as the thousand separator
//   const commaRegex = /^\d{1,3}(,\d{3})*(\.\d{2})?$/;
//   return commaRegex.test(stringValue) || noSeparatorRegex.test(stringValue);
// }

export function getDecimalValue (stringValue) {
  // Decimal separator should be reverse of thousands separator
  const separator = isDotSeparated(stringValue) ? '.' : ',';
  const decimalSeparator = isDotSeparated(stringValue) ? ',' : '.';

  const cleanedString = stringValue.replace(separator, '');
  const separatedValues = cleanedString.split(decimalSeparator);
  if (separatedValues.length === 1) return { amount: parseInt(separatedValues[0]), decimal: 0 };
  else return { amount: parseInt(separatedValues.join()), decimal: separatedValues[1].length };
}

export function findAllMoneyValues (emailBody, currency) {
  // Only checks for $ because it is a regex expression
  const currencyLiteral = currency === '$' ? '\\' + currency : currency;
  // Extract the invoice amount using a regular expression
  const regex = new RegExp(
    `${currencyLiteral}\\s*([\\d,\\.]+(?:\\.\\d{1,2})?)`,
    'gim',
  );
  const moneyValues = emailBody.match(regex) || [];
  return moneyValues.map(value => value.replace(currency, '').trim())
}

// Only applies for manual forwarding
// function getForwardedHeaders (headers) {
  // const regex = /^---------- Forwarded message ---------\nFrom: (.+)\nDate: (.+)\nSubject: (.+)\nTo: (.+)$/m;
  // const emailRegex = /<([^>]+)>/;
  // const match = emailBody.match(regex);
  // if (match) {
  //   const [, from, date, subject, to] = match;
  //   const fromMatch = from.match(emailRegex);
  //   const toMatch = to.match(emailRegex);
  //   return {
  //     from: fromMatch[1],
  //     date,
  //     subject,
  //     to: toMatch[1]
  //   }
  // } else return null
// }

export function currencyCodeToSymbol(currencyCode) {
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' });
    const parts = formatter.formatToParts(0); // Format zero to get currency symbol
    let symbol = '';

    for (const part of parts) {
      if (part.type === 'currency') {
        symbol = part.value;
        break;
      }
    }

    return symbol;
  } catch (error) {
    console.error('Error converting currency code to symbol:', error);
    return null;
  }
}
