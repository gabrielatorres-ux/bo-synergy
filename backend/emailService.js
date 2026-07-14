const nodemailer = require('nodemailer');
require('dotenv').config();
console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
console.log('📧 EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Configurada' : '❌ No configurada');

// Configurar el transporter de Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Función para enviar correo con PDF adjunto
const enviarCorreo = async (destinatario, asunto, mensaje, pdfBuffer, nombrePDF) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: destinatario,
      subject: asunto,
      text: mensaje,
      attachments: [
        {
          filename: nombrePDF,
          content: pdfBuffer,
          encoding: 'base64'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Correo enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error al enviar correo:', error);
    return { success: false, error: error.message };
  }
};

// Función para enviar correo sin adjunto
const enviarCorreoSimple = async (destinatario, asunto, mensaje) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: destinatario,
      subject: asunto,
      text: mensaje
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Correo enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error al enviar correo:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { enviarCorreo, enviarCorreoSimple };
