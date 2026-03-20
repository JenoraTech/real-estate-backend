// utils/notifications.js
const sgMail = require("@sendgrid/mail"); // ✅ Switched from Resend to SendGrid
const twilio = require("twilio");

// ✅ Initialize SendGrid using the key from your .env
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

/**
 * Sends an email using SendGrid
 */
exports.sendEmail = async (to, subject, htmlContent) => {
  try {
    // ✅ Updated logic to use SendGrid while maintaining your function structure
    const msg = {
      to: to,
      from: process.env.SENDER_EMAIL, // Must be your verified jenoratech@gmail.com
      subject: subject,
      html: htmlContent,
    };

    const data = await sgMail.send(msg);
    console.log(`✅ SendGrid Email sent to ${to}`);
    return data;
  } catch (error) {
    // Detailed error logging to help you debug SendGrid specifically
    console.error(
      "SendGrid Email Error:",
      error.response ? error.response.body : error.message,
    );
    throw new Error("Failed to send Email");
  }
};

/**
 * Sends an SMS using Twilio
 */
exports.sendSMS = async (to, body) => {
  try {
    const message = await twilioClient.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });
    return message.sid;
  } catch (error) {
    console.error("Twilio SMS Error:", error.message);
    throw new Error("Failed to send SMS");
  }
};
