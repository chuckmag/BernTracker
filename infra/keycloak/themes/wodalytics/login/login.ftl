<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Sign in – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Welcome to WODalytics</h1>
      <p class="subheading">Sign in to your account or create a new one.</p>

      <#if message?has_content && message.type != "success">
      <div class="alert alert-${message.type!"info"}">
        ${kcSanitize(message.summary)?no_esc}
      </div>
      </#if>

      <form id="kc-form-login" action="${url.loginAction}" method="post">
        <input type="hidden" name="credentialId"
               <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />

        <div class="form-group">
          <input
            type="text"
            id="username"
            name="username"
            class="form-input <#if messagesPerField.existsError('username','password')>input-error</#if>"
            value="${login.username!''}"
            placeholder="Email"
            autofocus
            autocomplete="username email"
          />
        </div>

        <div class="form-group">
          <input
            type="password"
            id="password"
            name="password"
            class="form-input <#if messagesPerField.existsError('username','password')>input-error</#if>"
            placeholder="Password"
            autocomplete="current-password"
          />
        </div>

        <div class="space-y-3">
          <button type="submit" class="btn btn-primary">Sign in</button>
        </div>
      </form>

      <#if realm.resetPasswordAllowed>
      <a href="${url.loginResetCredentialsUrl}" class="forgot-link">Forgot password?</a>
      </#if>

      <#if realm.registrationAllowed && !registrationDisabled??>
      <a href="${url.registrationUrl}" class="btn btn-outline">Create account</a>
      </#if>

      <#if social.providers?has_content>
      <div class="divider"><span>or</span></div>
      <#list social.providers as p>
      <a href="${p.loginUrl}" class="btn btn-social" id="social-${p.alias}">
        <#if p.alias == "google">
        <svg class="btn-social-logo" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        </#if>
        <span>Continue with ${p.displayName}</span>
      </a>
      </#list>
      </#if>
    </div>
  </main>
</body>
</html>
