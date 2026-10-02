import nodemailer from 'nodemailer';

export function mailer(config) {
  if (!config.enabled) return {sendCode: async () => {throw new Error('Accounts disabled');}};
  const {host,port,secure,user,pass,from} = config.smtp;
  if (!host || !user || !pass || !from || /[\r\n]/.test(from)) throw new Error('Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM');
  if (port === 465 && !secure) throw new Error('SMTP port 465 requires SMTP_SECURE=true');
  const transport = nodemailer.createTransport({
    host,port,secure,requireTLS: !secure,auth:{user,pass},
    tls:{rejectUnauthorized:true},connectionTimeout:10000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true
  });
  return {sendCode: ({email,code}) => transport.sendMail({
    from,to:email,subject:'Код входа в тренажёр ЕГЭ',
    text:`Ваш код подтверждения: ${code}\nОн действует 10 минут. Не сообщайте его другим людям.\nЕсли вы не запрашивали код, проигнорируйте это письмо.`
  })};
}
