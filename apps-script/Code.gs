/**
 * TreatStory mail relay. Paste this ENTIRE file into Apps Script's Code.gs.
 * Set Script Properties (Project Settings):
 *   MAIL_WEBHOOK_SECRET: same 64-character random value as APPS_SCRIPT_MAIL_SECRET in Vercel
 *   APP_URL: https://treatstory.vercel.app
 *   CRON_SECRET: same separate random value as CRON_SECRET in Vercel
 * Optional: MAIL_SENDER_NAME (defaults to TreatStory).
 * Run authorizeMail once, then deploy as a Web app: Execute as Me, access Anyone.
 * Use its /exec URL for APPS_SCRIPT_MAIL_URL in Vercel. Never put secrets in source code.
 */
var RECEIPT_PREFIX = 'mail_receipt_';
var RECEIPT_RETENTION_MS = 72 * 60 * 60 * 1000;
var REQUEST_WINDOW_MS = 5 * 60 * 1000;

function doGet() {
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
    if (!validMail_(mail)) return failure_('INVALID_REQUEST');
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
      // A crash may happen after MailApp sends but before the receipt is saved. Never blindly resend.
      return failure_('DELIVERY_UNCERTAIN');
    }
    if (MailApp.getRemainingDailyQuota() < 1) return failure_('QUOTA_EXCEEDED');
    // Save BEFORE sending, so a lost HTTP response or interrupted execution cannot cause a second send.
    properties.setProperty(receiptKey, JSON.stringify({state: 'sending', hash: hash, at: Date.now()}));
    try {
      var message = {
        to: mail.to[0],
        subject: mail.subject,
        body: mail.text,
        htmlBody: mail.html,
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
  if (Object.keys(mail).some(function (key) { return ['to', 'subject', 'text', 'html', 'reply_to'].indexOf(key) < 0; })) return false;
  return Array.isArray(mail.to) && mail.to.length === 1 && validEmail_(mail.to[0]) &&
    typeof mail.subject === 'string' && mail.subject.length > 0 && mail.subject.length <= 200 && !/[\r\n]/.test(mail.subject) &&
    typeof mail.text === 'string' && mail.text.length > 0 && mail.text.length <= 10000 &&
    typeof mail.html === 'string' && mail.html.length > 0 && mail.html.length <= 20000 &&
    (mail.reply_to === undefined || validEmail_(mail.reply_to));
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
