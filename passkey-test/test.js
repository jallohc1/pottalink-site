// Temporary passkey test for the hha-dev user pool (F4b). Calls the Cognito user pools API
// directly from the browser with the public web app client; no AWS keys are involved.
// Shows only token claims (amr, acr, auth_time, sid), never the tokens themselves.
(() => {
  'use strict';

  const CLIENT_ID = '2fqhhtgt96q66vt7pu90ttfuru';
  const ENDPOINT = 'https://cognito-idp.us-east-1.amazonaws.com/';

  let session = null; // the SMS_OTP challenge session
  let tokens = null; // { AccessToken, IdToken, RefreshToken } in memory only
  // Passkey prompts must open straight after a click (Safari), so every network call that
  // fetches passkey options happens before the click that opens the prompt.
  let registrationOptions = null;
  let passkeyStart = null;
  let stepUpStart = null;

  const $ = (id) => document.getElementById(id);
  const phone = () => $('phone').value.trim();

  function log(line) {
    $('log').textContent += `${new Date().toLocaleTimeString()}  ${line}\n`;
  }

  async function cognito(action, body) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const type = (data.__type || 'Error').split('#').pop();
      throw new Error(`${action}: ${type}: ${data.message || response.status}`);
    }
    return data;
  }

  function claims(token) {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const all = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return { amr: all.amr, acr: all.acr, auth_time: all.auth_time, sid: all.sid };
  }

  function signedIn(result, how) {
    tokens = result;
    const access = claims(result.AccessToken);
    log(`${how}: signed in. Access token claims: ${JSON.stringify(access)}`);
    $('list').disabled = false;
    $('step-up-prepare').disabled = false;
    prepareRegistration().catch((error) => log(`FAILED ${error.message}`));
  }

  async function prepareRegistration() {
    $('register').disabled = true;
    const start = await cognito('StartWebAuthnRegistration', { AccessToken: tokens.AccessToken });
    registrationOptions = start.CredentialCreationOptions;
    log(`Registration options ready (rp.id ${registrationOptions.rp?.id || 'not set'}).`);
    $('register').disabled = false;
  }

  // ---------- base64url <-> ArrayBuffer ----------
  function fromB64u(value) {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
  }
  function toB64u(buffer) {
    let raw = '';
    for (const byte of new Uint8Array(buffer)) raw += String.fromCharCode(byte);
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function creationOptions(json) {
    if (PublicKeyCredential.parseCreationOptionsFromJSON) {
      return PublicKeyCredential.parseCreationOptionsFromJSON(json);
    }
    return {
      ...json,
      challenge: fromB64u(json.challenge),
      user: { ...json.user, id: fromB64u(json.user.id) },
      excludeCredentials: (json.excludeCredentials || []).map((c) => ({ ...c, id: fromB64u(c.id) })),
    };
  }

  function requestOptions(json) {
    if (PublicKeyCredential.parseRequestOptionsFromJSON) {
      return PublicKeyCredential.parseRequestOptionsFromJSON(json);
    }
    return {
      ...json,
      challenge: fromB64u(json.challenge),
      allowCredentials: (json.allowCredentials || []).map((c) => ({ ...c, id: fromB64u(c.id) })),
    };
  }

  function credentialJson(credential) {
    if (typeof credential.toJSON === 'function') return credential.toJSON();
    const r = credential.response;
    const response = { clientDataJSON: toB64u(r.clientDataJSON) };
    if (r.attestationObject) {
      response.attestationObject = toB64u(r.attestationObject);
      response.transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
    } else {
      response.authenticatorData = toB64u(r.authenticatorData);
      response.signature = toB64u(r.signature);
      if (r.userHandle) response.userHandle = toB64u(r.userHandle);
    }
    return {
      id: credential.id,
      rawId: toB64u(credential.rawId),
      type: credential.type,
      response,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
    };
  }

  function checkPasskeyChallenge(start, label) {
    if (start.ChallengeName !== 'WEB_AUTHN') {
      throw new Error(`${label}: expected a WEB_AUTHN challenge, got ${start.ChallengeName || 'none'}`);
    }
    const options = JSON.parse(start.ChallengeParameters.CREDENTIAL_REQUEST_OPTIONS);
    log(`${label}: ready (rpId ${options.rpId || 'not set'}). Click Use passkey.`);
  }

  async function answerWithPasskey(start, label) {
    const options = JSON.parse(start.ChallengeParameters.CREDENTIAL_REQUEST_OPTIONS);
    const assertion = await navigator.credentials.get({ publicKey: requestOptions(options) });
    const done = await cognito('RespondToAuthChallenge', {
      ClientId: CLIENT_ID,
      ChallengeName: 'WEB_AUTHN',
      Session: start.Session,
      ChallengeResponses: { USERNAME: phone(), CREDENTIAL: JSON.stringify(credentialJson(assertion)) },
    });
    if (!done.AuthenticationResult) throw new Error(`${label}: no tokens returned`);
    signedIn(done.AuthenticationResult, label);
  }

  function guard(fn) {
    return async () => {
      try {
        await fn();
      } catch (error) {
        log(`FAILED ${error.name && error.name !== 'Error' ? `[${error.name}] ` : ''}${error.message}`);
      }
    };
  }

  $('send-code').addEventListener('click', guard(async () => {
    const start = await cognito('InitiateAuth', {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: phone(), PREFERRED_CHALLENGE: 'SMS_OTP' },
    });
    if (start.ChallengeName !== 'SMS_OTP') throw new Error(`expected SMS_OTP, got ${start.ChallengeName}`);
    session = start.Session;
    $('verify-code').disabled = false;
    log('Code sent. Check the hha-dev email (8 digits) and enter it within 5 minutes.');
  }));

  $('verify-code').addEventListener('click', guard(async () => {
    const code = ($('code').value.match(/\d{8}|\d{6}/) || [])[0];
    if (!code) throw new Error('enter the 8-digit code from the email');
    const done = await cognito('RespondToAuthChallenge', {
      ClientId: CLIENT_ID,
      ChallengeName: 'SMS_OTP',
      Session: session,
      ChallengeResponses: { USERNAME: phone(), SMS_OTP_CODE: code },
    });
    $('verify-code').disabled = true;
    signedIn(done.AuthenticationResult, 'SMS code');
  }));

  $('register').addEventListener('click', guard(async () => {
    const options = registrationOptions;
    registrationOptions = null;
    $('register').disabled = true;
    const credential = await navigator.credentials.create({ publicKey: creationOptions(options) });
    await cognito('CompleteWebAuthnRegistration', {
      AccessToken: tokens.AccessToken,
      Credential: credentialJson(credential),
    });
    log(`Passkey registered (authenticator: ${credential.authenticatorAttachment || 'unknown'}).`);
  }));
  // A failed or cancelled prompt uses up the options; fetch fresh ones for another try.
  $('register').addEventListener('click', () => {
    setTimeout(() => {
      if (tokens && !registrationOptions) prepareRegistration().catch(() => undefined);
    }, 1500);
  });

  $('list').addEventListener('click', guard(async () => {
    const listed = await cognito('ListWebAuthnCredentials', { AccessToken: tokens.AccessToken });
    const items = (listed.Credentials || []).map(
      (c) => `${c.FriendlyCredentialName || 'passkey'} (${c.AuthenticatorAttachment || '?'}, rp ${c.RelyingPartyId})`,
    );
    log(`Passkeys: ${items.length ? items.join('; ') : 'none'}`);
  }));

  $('passkey-prepare').addEventListener('click', guard(async () => {
    passkeyStart = await cognito('InitiateAuth', {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: phone(), PREFERRED_CHALLENGE: 'WEB_AUTHN' },
    });
    checkPasskeyChallenge(passkeyStart, 'Passkey sign-in');
    $('passkey-use').disabled = false;
  }));

  $('passkey-use').addEventListener('click', guard(async () => {
    const start = passkeyStart;
    passkeyStart = null;
    $('passkey-use').disabled = true;
    await answerWithPasskey(start, 'Passkey sign-in');
  }));

  $('step-up-prepare').addEventListener('click', guard(async () => {
    stepUpStart = await cognito('InitiateAuth', {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_AUTH',
      AuthParameters: {
        USERNAME: phone(),
        ACCESS_TOKEN: tokens.AccessToken,
        TARGET_ACR_VALUES: 'urn:cognito:loa:3',
        PREFERRED_CHALLENGE: 'WEB_AUTHN',
      },
    });
    checkPasskeyChallenge(stepUpStart, 'Step-up to level 3');
    $('step-up-use').disabled = false;
  }));

  $('step-up-use').addEventListener('click', guard(async () => {
    const start = stepUpStart;
    stepUpStart = null;
    $('step-up-use').disabled = true;
    await answerWithPasskey(start, 'Step-up to level 3');
  }));
})();
