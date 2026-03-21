const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

// ✅ Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ✅ Initialize Twilio with error handling for missing ENV vars
const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Sends an email using SendGrid
 */
exports.sendEmail = async (to, subject, htmlContent) => {
  try {
    const msg = {
      to: to.toLowerCase().trim(),
      from: {
        email: process.env.SENDER_EMAIL,
        name: "Jenora Properties", // Optional: Adds a professional name to the inbox
      },
      subject: subject,
      html: htmlContent,
    };

    const response = await sgMail.send(msg);
    console.log(`✅ SendGrid: Email successfully dispatched to ${to}`);
    return response;
  } catch (error) {
    // Captures the specific reason SendGrid rejected the request (e.g., unauthorized sender)
    const errorBody = error.response ? error.response.body : error.message;
    console.error(
      "❌ SendGrid Email Error:",
      JSON.stringify(errorBody, null, 2),
    );

    // We throw the error so the calling function (authController) knows it failed
    throw new Error("Email delivery failed");
  }
};

/**
 * Sends an SMS using Twilio
 */
exports.sendSMS = async (to, body) => {
  if (!twilioClient) {
    console.warn("⚠️ Twilio credentials missing. Skipping SMS.");
    return null;
  }

  try {
    // Ensure the phone number is in E.164 format (e.g., +1234567890)
    let formattedNumber = to.trim();
    if (!formattedNumber.startsWith("+")) {
      formattedNumber = `+${formattedNumber}`;
    }

    const message = await twilioClient.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber,
    });

    console.log(`✅ Twilio: SMS sent. SID: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error("❌ Twilio SMS Error:", error.message);
    // Don't always throw here if you want the user to still be created
    // even if the SMS provider is down or out of credit.
    return null;
  }
};
