/**
 * TreatStory mail relay. Paste this ENTIRE file into Apps Script's Code.gs.
 * Set Script Properties (Project Settings):
 *   MAIL_WEBHOOK_SECRET: same 64-character random value as APPS_SCRIPT_MAIL_SECRET in Vercel
 *   APP_URL: https://treatstory.vercel.app
 *   CRON_SECRET: same separate random value as CRON_SECRET in Vercel
 *   AUTH_ACTION_HOST: your Firebase project auth domain, e.g. your-project.firebaseapp.com
 * Optional: MAIL_SENDER_NAME (defaults to TreatStory).
 * Run authorizeMail once, then deploy as a Web app: Execute as Me, access Anyone.
 * Use its /exec URL for APPS_SCRIPT_MAIL_URL in Vercel. Never put secrets in source code.
 */
var RECEIPT_PREFIX = 'mail_receipt_';
var RECEIPT_RETENTION_MS = 72 * 60 * 60 * 1000;
var REQUEST_WINDOW_MS = 5 * 60 * 1000;

function doGet(e) {
  if(e && e.parameter && e.parameter.preview === '1') return HtmlService.createHtmlOutput(templateGallery_(PropertiesService.getScriptProperties())).setTitle('TreatStory email templates');
  return jsonResponse_({ok: true, service: 'TreatStory mail relay'});
}

function doPost(e) {
  var lock = null;
  try {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('MAIL_WEBHOOK_SECRET');
    if (!secret || secret.length < 32) return failure_('NOT_CONFIGURED');
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 40000) return failure_('INVALID_REQUEST');
    var request;
    try { request = JSON.parse(raw); } catch (_) { return failure_('INVALID_REQUEST'); }
    if (!validEnvelope_(request)) return failure_('INVALID_REQUEST');
    if (Math.abs(Date.now() - request.timestamp) > REQUEST_WINDOW_MS) return failure_('UNAUTHORIZED');
    var expected = bytesToHex_(Utilities.computeHmacSha256Signature(
      request.timestamp + '.' + request.id + '.' + request.payload, secret, Utilities.Charset.UTF_8));
    if (!constantEqual_(expected, request.signature)) return failure_('UNAUTHORIZED');

    var mail;
    try { mail = JSON.parse(request.payload); } catch (_) { return failure_('INVALID_REQUEST'); }
    if(mail && (mail.template==='password_reset'||mail.template==='verify_email') && mail.data && typeof mail.data.href==='string'){
      var linkError=actionUrlError_(mail.data.href,mail.template);
      if(linkError)return failure_(linkError);
    }
    if (!validMail_(mail)) return failure_('INVALID_REQUEST');
    var rendered;
    try { rendered = renderEmail_(mail, properties); } catch (_) { return failure_('INVALID_REQUEST'); }
    var hash = sha256_(request.payload);
    var receiptKey = RECEIPT_PREFIX + sha256_(request.id);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return failure_('BUSY');
    cleanupReceipts_(properties);
    var stored = properties.getProperty(receiptKey);
    if (stored) {
      var receipt = JSON.parse(stored);
      if (receipt.hash !== hash) return failure_('ID_CONFLICT');
      if (receipt.state === 'sent') return jsonResponse_({ok: true, id: request.id, duplicate: true});
      // A crash may happen after MailApp sends but before the receipt is saved. Never blindly send again.
      return failure_('DELIVERY_UNCERTAIN');
    }
    if (MailApp.getRemainingDailyQuota() < 1) return failure_('QUOTA_EXCEEDED');
    // Save BEFORE sending, so a lost HTTP response or interrupted execution cannot cause a second send.
    properties.setProperty(receiptKey, JSON.stringify({state: 'sending', hash: hash, at: Date.now()}));
    try {
      var message = {
        to: mail.to[0],
        subject: rendered.subject,
        body: rendered.text,
        htmlBody: rendered.html,
        name: properties.getProperty('MAIL_SENDER_NAME') || 'TreatStory'
      };
      if (mail.reply_to) message.replyTo = mail.reply_to;
      MailApp.sendEmail(message);
      properties.setProperty(receiptKey, JSON.stringify({state: 'sent', hash: hash, at: Date.now()}));
    } catch (_) {
      // MailApp exceptions are not guaranteed to establish whether the send happened.
      return failure_('DELIVERY_UNCERTAIN');
    }
    return jsonResponse_({ok: true, id: request.id});
  } catch (_) {
    // Do not return/log payloads, addresses, keys or server exception details.
    return failure_('TEMPORARILY_UNAVAILABLE');
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function validEnvelope_(request) {
  return request && request.version === 1 && Number.isSafeInteger(request.timestamp) &&
    typeof request.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.id) &&
    typeof request.payload === 'string' && request.payload.length <= 30000 &&
    typeof request.signature === 'string' && /^[a-f0-9]{64}$/.test(request.signature);
}

function validMail_(mail) {
  if (!mail || typeof mail !== 'object' || Array.isArray(mail)) return false;
  if (Object.keys(mail).some(function (key) { return ['to', 'template', 'data', 'reply_to'].indexOf(key) < 0; })) return false;
  if (!Array.isArray(mail.to) || mail.to.length !== 1 || !validEmail_(mail.to[0])) return false;
  if (typeof mail.template !== 'string' || !Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES,mail.template)) return false;
  var data = mail.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (Object.keys(data).some(function (key) { return ['title','message','href','label','reference','details'].indexOf(key) < 0; })) return false;
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 160 || /[\r\n]/.test(data.title)) return false;
  if (typeof data.message !== 'string' || data.message.length < 1 || data.message.length > 6000) return false;
  if (typeof data.href !== 'string' || data.href.length > 4096 || !validActionUrl_(data.href,mail.template)) return false;
  if (data.label !== undefined && (typeof data.label !== 'string' || data.label.length > 80)) return false;
  if (data.reference !== undefined && (typeof data.reference !== 'string' || data.reference.length > 80 || /[\r\n]/.test(data.reference))) return false;
  if (data.details !== undefined && (!Array.isArray(data.details) || data.details.length > 12 || data.details.some(function (row) {
    return !row || typeof row.label !== 'string' || row.label.length > 80 || typeof row.value !== 'string' || row.value.length > 600;
  }))) return false;
  return mail.reply_to === undefined || validEmail_(mail.reply_to);
}

function validActionUrl_(url,template) {
  return actionUrlError_(url,template) === null;
}

function actionUrlError_(url,template) {
  var properties = PropertiesService.getScriptProperties();
  var origin = validatedAppUrl_(properties);
  if (/[\s<>"']/.test(url)) return 'INVALID_REQUEST';
  if (url.indexOf(origin + '/') === 0) return null;
  if (template !== 'verify_email' && template !== 'password_reset') return 'INVALID_REQUEST';
  // Accept a copied HTTPS origin or quoted SDK value, but still require the exact approved host.
  var host = (properties.getProperty('AUTH_ACTION_HOST') || '').trim().replace(/^['"]|['"]$/g,'').replace(/^https:\/\//i,'').replace(/\/$/,'').toLowerCase();
  if (!/^[a-z0-9-]+\.(?:firebaseapp\.com|web\.app)$/.test(host)) return 'AUTH_HOST_NOT_CONFIGURED';
  return url.indexOf('https://' + host + '/__/auth/action?') === 0 ? null : 'AUTH_HOST_MISMATCH';
}

function validEmail_(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
}

function constantEqual_(a, b) {
  if (typeof b !== 'string' || a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function bytesToHex_(bytes) {
  return bytes.map(function (value) { return ('0' + ((value + 256) % 256).toString(16)).slice(-2); }).join('');
}

function sha256_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}

function cleanupReceipts_(properties) {
  var all = properties.getProperties();
  var cutoff = Date.now() - RECEIPT_RETENTION_MS;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(RECEIPT_PREFIX) !== 0) return;
    var receipt = JSON.parse(all[key]);
    if (receipt.at < cutoff) properties.deleteProperty(key);
  });
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function failure_(code) {
  return jsonResponse_({ok: false, code: code});
}

/** Run this in the editor once to authorize sending. It does NOT send a test email. */
function authorizeMail() {
  console.log('Remaining email recipient quota: ' + MailApp.getRemainingDailyQuota());
}

/** Run once AFTER deploying the app and setting CRON_SECRET in both places. */
function installRetryTrigger() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('CRON_SECRET')) throw new Error('Set CRON_SECRET in Script Properties first.');
  validatedAppUrl_(properties);
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processEmailQueue') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processEmailQueue').timeBased().everyMinutes(5).create();
}

/** Time trigger: asks the Vercel server to retry due jobs. It never exposes the cron secret in a URL. */
function processEmailQueue() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('CRON_SECRET');
  if (!secret) throw new Error('Missing CRON_SECRET.');
  var response = UrlFetchApp.fetch(validatedAppUrl_(properties) + '/api/email/process', {
    method: 'get', headers: {Authorization: 'Bearer ' + secret},
    followRedirects: false, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Email retry endpoint returned HTTP ' + response.getResponseCode());
  var result;
  try { result = JSON.parse(response.getContentText()); } catch (_) { throw new Error('Email retry endpoint did not return JSON.'); }
  if (result.configured !== true) throw new Error('Check the app email environment variables.');
}

function validatedAppUrl_(properties) {
  var origin = (properties.getProperty('APP_URL') || '').replace(/\/$/, '');
  // Restrict the retry secret to this application's actual origin.
  if (origin !== 'https://treatstory.vercel.app') throw new Error('APP_URL must be https://treatstory.vercel.app. Update this check if you move domains.');
  return origin;
}

/** Edit these entries to customize each situation. All outgoing mail uses this catalog. */
var EMAIL_TEMPLATES = {
  welcome: {tag:'A lovely beginning',heading:'Welcome to TreatStory',button:'Explore your account',note:'Find your favourites, meet independent makers, and keep every order in one place.'},
  verify_email: {tag:'Account security',heading:'Confirm your email address',button:'Verify email address',note:'If you did not create this account, ignore this message. Never share this link with anyone.'},
  password_reset: {tag:'Account security',heading:'Reset your password',button:'Choose a new password',note:'If you did not request a reset, ignore this message. Your password stays unchanged until you complete the reset.'},
  order_received: {tag:'Your order request',heading:'Your request is with the maker',button:'View your order',note:'This is an order request. Your seller will confirm availability, preparation, delivery and any payment arrangements.'},
  new_order: {tag:'For your seller studio',heading:'A new order request arrived',button:'Review order request',note:'Check the selected product, requested date, stock and payment terms before accepting.'},
  order_accepted: {tag:'Order update',heading:'Your order is accepted',button:'View order details',note:'Your maker has accepted the request. Check your order for agreed preparation and delivery details.',tone:'green'},
  order_preparing: {tag:'Made with care',heading:'Preparation has started',button:'Follow your order',note:'Your creation is being prepared. Contact the seller through the app if you need help.'},
  order_ready_pickup: {tag:'Ready for you',heading:'Ready for collection',button:'View pickup details',note:'Confirm the collection location and time with your maker before travelling.',tone:'green'},
  order_ready_delivery: {tag:'Almost there',heading:'Ready for delivery',button:'View delivery details',note:'Your seller handles delivery arrangements. Review your order for the latest details.',tone:'green'},
  order_out_for_delivery: {tag:'On its way',heading:'Your order is out for delivery',button:'View your order',note:'Keep your phone available for delivery updates from the seller.'},
  order_collected: {tag:'A story completed',heading:'Your order was marked collected',button:'Review your order',note:'Collection was recorded as complete. Contact your maker if this does not match your experience.',tone:'green'},
  order_delivered: {tag:'A story completed',heading:'Your order was marked delivered',button:'Review your order',note:'Delivery was recorded as complete. Contact your maker if you still need help.',tone:'green'},
  order_cancel_requested: {tag:'Cancellation update',heading:'A cancellation needs review',button:'View cancellation request',note:'A cancellation request does not cancel the order automatically. The seller must review it.',tone:'amber'},
  order_cancel_declined: {tag:'Cancellation update',heading:'Cancellation request declined',button:'Review your order',note:'The order continues. Contact the seller if you need to discuss the next steps.',tone:'amber'},
  order_cancelled: {tag:'Order update',heading:'Your order is cancelled',button:'View cancelled order',note:'Any advance-payment refund must be arranged directly with the seller. No automatic refund is recorded here.',tone:'amber'},
  order_declined: {tag:'Order update',heading:'This order was declined',button:'View order details',note:'Contact the seller about any advance payment already made, or explore another maker.',tone:'amber'},
  payment_recorded: {tag:'Payment update',heading:'The seller recorded a payment',button:'View payment record',note:'This is a seller-entered payment record. TreatStory did not process an online charge.',tone:'green'},
  quote_requested: {tag:'A custom creation',heading:'A new custom request arrived',button:'Review custom request',note:'Review the buyer’s preferences, reference image, budget and requested date before quoting.'},
  quote_ready: {tag:'Made just for you',heading:'Your custom quote is ready',button:'Review your quote',note:'Check the price and what is included. Accepting a quote does not place an order or collect payment.'},
  quote_accepted: {tag:'Custom quote update',heading:'Your custom quote was accepted',button:'Open custom request',note:'Agree on the final order, preparation and payment arrangements directly with the buyer.',tone:'green'},
  quote_declined: {tag:'Custom quote update',heading:'This custom request was declined',button:'View custom request',note:'This maker cannot take the request. You can explore other makers for your creation.',tone:'amber'},
  support_received: {tag:'We are here to help',heading:'Your support request is received',button:'Track support request',note:'Keep the conversation in your support request so the TreatStory team has the details together.'},
  support_reply: {tag:'A reply from TreatStory',heading:'There is a reply to your request',button:'Read the response',note:'Open your support request to read the response and review the next steps.'},
  support_closed: {tag:'Support update',heading:'Your support request was closed',button:'View support request',note:'If you still need help, you can open a new support request.',tone:'green'},
  support_new: {tag:'For the TreatStory team',heading:'A new support request arrived',button:'Open support inbox',note:'Sign in to the admin workspace to review the customer’s details.'},
  seller_application_received: {tag:'Your maker journey',heading:'Your seller application is received',button:'View your application',note:'Your application is awaiting review. We will send an update when its status changes.'},
  seller_application_approved: {tag:'Welcome, maker',heading:'Your seller application is approved',button:'Open seller studio',note:'Review your access plan and expiry in your seller studio before publishing products.',tone:'green'},
  seller_application_declined: {tag:'Application update',heading:'Your seller application was declined',button:'View your application',note:'Contact TreatStory support if you need help understanding the next steps.',tone:'amber'},
  seller_application_new: {tag:'For the TreatStory team',heading:'A maker wants to join TreatStory',button:'Review application',note:'Review the business details before granting seller access.'},
  seller_access_updated: {tag:'Seller access',heading:'Your seller access has changed',button:'Review seller access',note:'Check the current plan, status and expiry in your seller studio. This update does not collect a payment.'},
  update: {tag:'Your TreatStory update',heading:'Something new in your story',button:'View update',note:'Sign in to TreatStory to see the latest details.'}
};

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
  });
}

/** Approved Concept 01: the original TreatStory_Email_Design_Preview.html.
 * Table-based, image-free, responsive transactional email. All 31 events share
 * the same design; the catalog retains the correct per-event messages and actions.
 * Do not remove escaping, the secure account-link fallback or plain-text output.
 */
function renderEmail_(mail, properties) {
  var template = EMAIL_TEMPLATES[mail.template];
  var data = mail.data;
  var title = template.heading || data.title;
  var label = data.label || template.button;
  var origin = validatedAppUrl_(properties);
  var security = mail.template === 'password_reset' || mail.template === 'verify_email';
  var orderEvent = /^order_/.test(mail.template) || mail.template === 'new_order' || mail.template === 'payment_recorded';
  var reference = data.reference || '';
  var accent = template.tone === 'green' ? '#426d58' : template.tone === 'amber' ? '#976b35' : '#a68b67';
  var accentBg = template.tone === 'green' ? '#f1f5f0' : template.tone === 'amber' ? '#f9f5ed' : '#f8f5ef';
  var details = (data.details || []).map(function (row) {
    var total = row.label === 'Order total';
    var color = total ? '#25231f' : '#292722';
    return '<tr>' +
      '<td class="detail-key" width="43%" style="padding:13px 6px 13px 0;border-bottom:1px solid #ece8e1;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#827a70;vertical-align:top;' + (total ? 'font-weight:bold;' : '') + '">' + escapeHtml_(row.label) + '</td>' +
      '<td style="padding:13px 0;border-bottom:1px solid #ece8e1;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;font-weight:600;text-align:right;color:' + color + ';vertical-align:top;overflow-wrap:anywhere;word-break:break-word">' + escapeHtml_(row.value) + '</td>' +
      '</tr>';
  }).join('');
  var preheader = (reference ? reference + ' · ' : '') + data.message.slice(0,140);
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + escapeHtml_(title) + '</title>' +
    '<style type="text/css">@media only screen and (max-width:600px){.outer{padding:12px 8px 28px!important}.mail{width:100%!important;max-width:100%!important}.mail-header{padding:25px 23px 22px!important}.mail-content{padding:30px 23px 32px!important}.mail-title{font-size:29px!important;line-height:1.16!important}.mail-footer{padding:22px 23px 26px!important}.mail-tagline{display:none!important}.button-table{width:100%!important}.button-cell{display:block!important;text-align:center!important}.button-link{display:block!important;padding:17px 13px!important}.reference-value{white-space:normal!important;word-break:break-word!important}.detail-key{width:41%!important}.mail-note{line-height:1.6!important}}' +
    '@media (prefers-reduced-motion:reduce){*{transition:none!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:#f3f2ef;color:#282520;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">' +
    '<div style="display:none!important;visibility:hidden;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">' + escapeHtml_(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f2ef"><tr><td class="outer" align="center" style="padding:38px 20px 54px">' +
    '<table role="presentation" class="mail" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e7e3db">' +
    '<tr><td class="mail-header" style="padding:29px 46px 24px;border-bottom:1px solid #efebe5"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="vertical-align:middle"><a href="' + escapeHtml_(origin) + '" style="font-family:Georgia,Times New Roman,serif;font-size:26px;line-height:1.3;letter-spacing:-1.15px;color:#292621;text-decoration:none;white-space:nowrap">TreatStory<span style="color:#ae906c">.</span></a></td>' +
    '<td class="mail-tagline" align="right" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:bold;letter-spacing:1.4px;color:#aea69a">LITTLE FINDS. LOVELY STORIES.</td>' +
    '</tr></table></td></tr>' +
    '<tr><td class="mail-content" style="padding:42px 46px 41px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="3" bgcolor="#b09573" style="height:3px;background:#b09573;font-size:1px;line-height:1px"></td><td width="5"></td><td width="5" height="3" bgcolor="#dfd5c9" style="height:3px;background:#dfd5c9;font-size:1px;line-height:1px"></td></tr></table>' +
    '<p style="margin:24px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.5;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:' + accent + '">' + escapeHtml_(template.tag) + '</p>' +
    '<h1 class="mail-title" style="margin:0 0 21px;font-family:Georgia,Times New Roman,serif;font-size:36px;line-height:1.18;font-weight:normal;letter-spacing:-1.05px;color:#25231f">' + escapeHtml_(title) + '</h1>' +
    '<p style="margin:0 0 29px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.83;color:#615d57;overflow-wrap:anywhere;word-break:break-word">' + escapeHtml_(data.message).replace(/\n/g, '<br>') + '</p>' +
    (reference ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="padding:17px 20px;background:' + accentBg + ';border-left:3px solid ' + accent + '">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1.5px;color:' + accent + '">' + (orderEvent ? 'ORDER REFERENCE' : 'REFERENCE') + '</div>' +
      '<div class="reference-value" style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;font-weight:600;letter-spacing:0.3px;color:#302c25">' + escapeHtml_(reference) + '</div></td></tr></table>' : '') +
    (details ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-top:1px solid #ece8e1;border-collapse:collapse">' + details + '</table>' : '') +
    '<table role="presentation" class="button-table" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 27px"><tr><td class="button-cell" align="center" bgcolor="#292722" style="background:#292722;border-radius:5px">' +
    '<a class="button-link" href="' + escapeHtml_(data.href) + '" style="display:inline-block;padding:17px 23px;border-radius:5px;background:#292722;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;font-weight:bold;color:#fff;text-decoration:none">' + escapeHtml_(label) + ' &rarr;</a></td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfaf8;border-left:2px solid #d6c9b5"><tr><td style="padding:15px 17px"><p class="mail-note" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#6c655d">' + escapeHtml_(template.note) + '</p></td></tr></table>' +
    (security ? '<p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#948c81">If the button does not open, copy this secure link:<br><a href="' + escapeHtml_(data.href) + '" style="color:#6a6056;word-break:break-all;overflow-wrap:anywhere">' + escapeHtml_(data.href) + '</a></p>' : '') +
    '</td></tr><tr><td class="mail-footer" style="padding:25px 46px 29px;border-top:1px solid #efebe5">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#4e4942">TreatStory</td>' +
    '<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#aaa095">MADE WITH CARE IN KERALA</td></tr></table>' +
    '<p style="margin:13px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.8;color:#999187">Little finds, lovely stories.<br>This email is about your account or recent activity.</p>' +
    '</td></tr></table></td></tr></table></body></html>';
  var detailText = (data.details || []).map(function (row) { return row.label + ': ' + row.value; }).join('\n');
  return {
    subject: 'TreatStory · ' + title + (reference ? ' · ' + reference : ''),
    html: html,
    text: title + (reference ? '\n' + (orderEvent ? 'Order ID: ' : 'Reference: ') + reference : '') +
      '\n\n' + data.message + (detailText ? '\n\n' + detailText : '') +
      '\n\n' + label + ': ' + data.href + '\n\n' + template.note +
      '\n\nTreatStory · Little finds, lovely stories.'
  };
}

/** Public previews contain only sample text and no account records, recipients, tokens or secrets. */
function templateGallery_(properties) {
  var origin = validatedAppUrl_(properties);
  var cards = Object.keys(EMAIL_TEMPLATES).map(function (key) {
    var template = EMAIL_TEMPLATES[key];
    var rendered = renderEmail_({template:key,data:{title:template.heading,message:'This is a sample ' + key.replace(/_/g,' ') + ' message. Real emails include the details for your activity.',href:origin + '/account',...((key.indexOf('order_')===0||key==='new_order'||key==='payment_recorded')?{reference:'TS-A1B2C3D4E5F6',details:[{label:'Product',value:'Chocolate cake · 500 g'},{label:'Quantity',value:'1'},{label:'Order total',value:'₹450.00'},{label:'Requested for',value:'Sample date · 10 AM–12 PM'}]}:{details:[{label:'Preview',value:'Sample data only'}]})}},properties);
    return '<section><h2 style="font:15px Arial;color:#6e6255">' + escapeHtml_(key) + '</h2><iframe title="' + escapeHtml_(key) + '" style="width:100%;height:780px;border:1px solid #e9e0d3;border-radius:20px" srcdoc="' + escapeHtml_(rendered.html) + '"></iframe></section>';
  }).join('');
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TreatStory email templates</title></head><body style="margin:0;background:#f7f4ee;padding:24px"><h1 style="font:32px Georgia;color:#302b25">TreatStory email previews</h1><p style="font:14px Arial;color:#7d6c58">Sample messages only. Opening this page does not send email.</p><main style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px">' + cards + '</main></body></html>';
}
