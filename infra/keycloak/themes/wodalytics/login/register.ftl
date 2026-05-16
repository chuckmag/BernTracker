<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Create account – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Create your account</h1>
      <p class="subheading">Join WODalytics today.</p>

      <#if message?has_content && message.type != "success">
      <div class="alert alert-${message.type!"info"}">
        ${kcSanitize(message.summary)?no_esc}
      </div>
      </#if>

      <form id="kc-register-form" action="${url.registrationAction}" method="post">

        <div class="form-row">
          <div class="form-group">
            <input
              type="text"
              id="firstName"
              name="firstName"
              class="form-input <#if messagesPerField.existsError('firstName')>input-error</#if>"
              value="${(register.firstName!'')}"
              placeholder="First name"
              autocomplete="given-name"
            />
          </div>
          <div class="form-group">
            <input
              type="text"
              id="lastName"
              name="lastName"
              class="form-input <#if messagesPerField.existsError('lastName')>input-error</#if>"
              value="${(register.lastName!'')}"
              placeholder="Last name"
              autocomplete="family-name"
            />
          </div>
        </div>

        <div class="form-group">
          <input
            type="email"
            id="email"
            name="email"
            class="form-input <#if messagesPerField.existsError('email')>input-error</#if>"
            value="${(register.email!'')}"
            placeholder="Email"
            autocomplete="email"
            autofocus
          />
        </div>

        <div class="form-group">
          <input
            type="password"
            id="password"
            name="password"
            class="form-input <#if messagesPerField.existsError('password','password-confirm')>input-error</#if>"
            placeholder="Password"
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            class="form-input <#if messagesPerField.existsError('password-confirm')>input-error</#if>"
            placeholder="Confirm password"
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="btn btn-primary">Create account</button>
      </form>

      <a href="${url.loginUrl}" class="btn btn-outline">Back to sign in</a>
    </div>
  </main>
</body>
</html>
