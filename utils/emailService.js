// src/utils/emailService.js
const sgMail = require("@sendgrid/mail");

// Set the API Key from your .env
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendOTP = async (email, otp) => {
  const msg = {
    to: email,
    from: process.env.SENDER_EMAIL, // Must match your verified SendGrid sender
    subject: "Jenora Properties - Verification Code",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #0B1221; text-align: center;">Jenora Properties</h2>
        <p>Hello,</p>
        <p>Thank you for joining us. Please use the following code to verify your account:</p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #D4AF37;">
          ${otp}
        </div>
        <p style="margin-top: 20px;">This code will expire in 10 minutes.</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #888;">If you did not request this code, please ignore this email.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ OTP sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error(
      "❌ SendGrid Error:",
      error.response ? error.response.body : error,
    );
    return false;
  }
};

module.exports = { sendOTP };
