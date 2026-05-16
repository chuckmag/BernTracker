<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Reset password – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Reset your password</h1>
      <p class="subheading">Enter your email and we'll send you a reset link.</p>

      <#if message?has_content && message.type != "success">
      <div class="alert alert-${message.type!"info"}">
        ${kcSanitize(message.summary)?no_esc}
      </div>
      </#if>

      <form action="${url.loginAction}" method="post">
        <div class="form-group">
          <input
            type="text"
            id="username"
            name="username"
            class="form-input <#if messagesPerField.existsError('username')>input-error</#if>"
            value="${(auth.attemptedUsername!'')}"
            placeholder="Email"
            autofocus
            autocomplete="email"
          />
        </div>

        <button type="submit" class="btn btn-primary">Send reset link</button>
      </form>

      <a href="${url.loginUrl}" class="btn btn-outline">Back to sign in</a>
    </div>
  </main>
</body>
</html>
