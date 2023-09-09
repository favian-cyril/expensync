import { createClient } from '@supabase/supabase-js';
import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';
import { parseEmailChatgpt, manualParseEmail } from './parsers.mjs';
import { currencyCodeToSymbol, getForwardedHeaders } from './utils.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

async function parseAndDecodeContent (event) {
  // Parse sns message
  const { content } = JSON.parse(event.Records[0].Sns.Message);
  // Decode and convert html to text
  const parsedMail = await simpleParser(Buffer.from(content, 'base64url').toString('utf8'));
  const htmlText = convert(parsedMail.html, {
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
  const contentText = parsedMail.text;
  const manualHeaders = getForwardedHeaders(htmlText)
  if (manualHeaders) {
    return {
      to: manualHeaders.to,
      from: manualHeaders.from,
      date: manualHeaders.date,
      messageId: parsedMail.messageId,
      htmlText,
      contentText,
    }
  }
  return {
    to: parsedMail.to.value[0].address,
    from: parsedMail.from.value[0].address,
    date: parsedMail.headers.get('date'),
    messageId: parsedMail.messageId,
    htmlText,
    contentText,
  }
}

async function getSenderAndUserData (userEmail, senderEmail) {
  const { data: userData, error: userError }  = await supabase.from('User').select('*').ilike('email', userEmail).limit(1);
  const { data: senderData, error: senderError } = await supabase.from('SenderEmail')
      .select('uuid,email,Category(uuid)')
      .eq('user_id', userData[0].uuid)
      .limit(1)
      .ilike('email', senderEmail);
  if (userError) throw new Error(userError.message);
  if (senderError) throw new Error(senderError.message);
  return { userData, senderData };
}

export const handler = async (event) => {
    try {
        const { to, from, date, htmlText, messageId, contentText } = await parseAndDecodeContent(event);
        // Handle verification forwarding address
        if (from === 'forwarding-noreply@google.com') {
          const linkRegex = /(https:\S+)/g;
          const link = contentText.match(linkRegex);
          const fixedLink = link[0].replace('mail-settings.google.com', 'mail.google.com');
          await fetch(fixedLink, {
            method: 'POST',
            body: {}
          })
          return {
            statusCode: 200,
            body: 'Success'
          };
        }
        // check for user and sender in db
        const { userData, senderData } = await getSenderAndUserData(to, from);
        if (userData.length === 1 && senderData.length === 1) {
            const { data: categories } = await supabase.from('Category').select('uuid, value').eq('user_id', userData[0].uuid);
            let invoice;
            const currencyCode = userData[0].currency;
            const currencySymbol = currencyCodeToSymbol(currencyCode);
            invoice = await parseEmailChatgpt(categories, htmlText, messageId, date, currencyCode);
            // Fallback function
            if (invoice === null) {
              invoice = manualParseEmail(htmlText, currencySymbol, currencyCode, messageId, date)
            }
            console.log('invoice:', invoice);
            if (invoice) {
              const invoiceData = {
                user_id: userData[0].uuid,
                sender_email_id: senderData[0].uuid,
                ...invoice,
                category_id: senderData[0].category_id || invoice.category_id || null,
              }
              const { error } = await supabase.from('Invoice').insert(invoiceData);
              if (error) {
                console.error('An error occurred:', error);
                throw new Error('Cannot save invoice')
              }
            }
            return {
              statusCode: 200,
              body: 'Success'
            }
        } else {
          throw new Error('User or sender not found');
        }
    } catch (err) {
        console.error('An error occurred:', err);
        return {
            statusCode: 500,
            body: JSON.stringify('An error occurred while processing the email.'),
        };
    }
};

