<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Set new password – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Set a new password</h1>
      <p class="subheading">Choose a new password for your account.</p>

      <#if message?has_content && message.type != "success">
      <div class="alert alert-${message.type!"info"}">
        ${kcSanitize(message.summary)?no_esc}
      </div>
      </#if>

      <form action="${url.loginAction}" method="post">
        <input type="hidden" name="username" value="${username!''}"/>
        <input type="hidden" name="credentialId" value="${credentialId!''}"/>

        <div class="form-group">
          <input
            type="password"
            id="password-new"
            name="password-new"
            class="form-input <#if messagesPerField.existsError('password-new','password-confirm')>input-error</#if>"
            placeholder="New password"
            autocomplete="new-password"
            autofocus
          />
        </div>

        <div class="form-group">
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            class="form-input <#if messagesPerField.existsError('password-confirm')>input-error</#if>"
            placeholder="Confirm new password"
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="btn btn-primary">Set password</button>
      </form>
    </div>
  </main>
</body>
</html>
