/* global AmazonCognitoIdentity */

const POOL_ID   = 'us-east-1_x0jPhS0xj';
const CLIENT_ID = '65brgla25g237lk7ajrm7kptm8';

const userPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: POOL_ID,
  ClientId:   CLIENT_ID,
});

function makeUser(email) {
  return new AmazonCognitoIdentity.CognitoUser({ Username: email.toLowerCase(), Pool: userPool });
}

const Auth = {
  // Returns JWT id-token string, or null if not signed in.
  getToken() {
    return new Promise(resolve => {
      const user = userPool.getCurrentUser();
      if (!user) return resolve(null);
      user.getSession((err, session) => {
        resolve(!err && session && session.isValid() ? session.getIdToken().getJwtToken() : null);
      });
    });
  },

  // Returns email string from current session, or null.
  getEmail() {
    return new Promise(resolve => {
      const user = userPool.getCurrentUser();
      if (!user) return resolve(null);
      user.getSession((err, session) => {
        if (err || !session?.isValid()) return resolve(null);
        resolve(session.getIdToken().payload.email || null);
      });
    });
  },

  signIn(email, password) {
    return new Promise((resolve) => {
      const user    = makeUser(email);
      const details = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email.toLowerCase(), Password: password });
      user.authenticateUser(details, {
        onSuccess: () => resolve({ ok: true }),
        onFailure: (err) => {
          if (err.code === 'UserNotConfirmedException') return resolve({ ok: false, needsVerification: true, email });
          resolve({ ok: false, error: err.message || String(err) });
        },
        newPasswordRequired: () => resolve({ ok: false, error: 'Password reset required. Please contact support.' }),
      });
    });
  },

  signUp(email, password) {
    return new Promise(resolve => {
      const attrs = [new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: email.toLowerCase() })];
      userPool.signUp(email.toLowerCase(), password, attrs, null, (err) => {
        if (err) return resolve({ ok: false, error: err.message || String(err) });
        resolve({ ok: true });
      });
    });
  },

  confirmSignUp(email, code) {
    return new Promise(resolve => {
      makeUser(email).confirmRegistration(code, true, (err) => {
        if (err) return resolve({ ok: false, error: err.message || String(err) });
        resolve({ ok: true });
      });
    });
  },

  resendCode(email) {
    return new Promise(resolve => {
      makeUser(email).resendConfirmationCode((err) => {
        if (err) return resolve({ ok: false, error: err.message || String(err) });
        resolve({ ok: true });
      });
    });
  },

  forgotPassword(email) {
    return new Promise(resolve => {
      makeUser(email).forgotPassword({
        onSuccess: () => resolve({ ok: true }),
        onFailure: (err) => resolve({ ok: false, error: err.message || String(err) }),
        inputVerificationCode: () => resolve({ ok: true }),
      });
    });
  },

  confirmNewPassword(email, code, newPassword) {
    return new Promise(resolve => {
      makeUser(email).confirmPassword(code, newPassword, {
        onSuccess: () => resolve({ ok: true }),
        onFailure: (err) => resolve({ ok: false, error: err.message || String(err) }),
      });
    });
  },

  signOut() {
    userPool.getCurrentUser()?.signOut();
  },
};

window.Auth = Auth;
