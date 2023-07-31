import { createClient } from '@supabase/supabase-js';
import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';
import { parseEmailChatgpt, manualParseEmail } from './parsers';

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
  return {
    to: parsedMail.to.value[0].address,
    from: parsedMail.from.value[0].address,
    date: parsedMail.headers.get('date'),
    messageId: parsedMail.messageId,
    htmlText,
  }
}

async function getSenderAndUserData (userEmail, senderEmail) {
  const [{ data: userData, error: userError }, { data: senderData, error: senderError }]  = await Promise.all([
    supabase.from('User').select('*').eq('email', userEmail),
    supabase.from('SenderEmail')
      .select('id,email,Category(id)')
      .eq('email', senderEmail),
  ]);
  if (userError) return new Error(userError.message);
  if (senderError) return new Error(senderError.message);
  return { userData, senderData };
}

export const handler = async (event) => {
    try {
        const { to, from, date, htmlText, messageId } = await parseAndDecodeContent(event);
        // check for user and sender in db
        const { userData, senderData } = await getSenderAndUserData(to, from);
        if (userData.length === 1 && senderData.length === 1) {
            const { data: categories } = await supabase.from('Category').select('id, value').eq('user_id', userData[0].id);
            let invoice;
            invoice = await parseEmailChatgpt(categories, htmlText, messageId, date);
            // Fallback function
            if (invoice === null) {
              invoice = manualParseEmail(htmlText, userData[0].currency, messageId, date)
            }
            console.log('invoice:', invoice);
            if (invoice) {
              const invoiceData = {
                category_id: senderData[0].category_id || null,
                user_id: userData[0].id,
                sender_email_id: senderData[0].id,
                ...invoice,
              }
              const { error } = await supabase.from('Invoice').insert(invoiceData);
              if (error) {
                console.error('An error occurred:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify('An error occurred while processing the email.'),
                };
              }
            }
            return {
              statusCode: 200,
              body: 'Success'
            }
        } else {
          new Error('User or sender not found');
        }
    } catch (err) {
        console.error('An error occurred:', err);
        return {
            statusCode: 500,
            body: JSON.stringify('An error occurred while processing the email.'),
        };
    }
};

