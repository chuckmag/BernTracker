<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Verify email – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Check your email</h1>
      <p class="subheading">
        <#if verifyEmail??>
          We sent a verification link to <strong>${verifyEmail}</strong>.
        <#else>
          We sent a verification link to <strong>${user.email}</strong>.
        </#if>
      </p>

      <p class="subheading">
        Didn't get it? <a href="${url.loginAction}" class="forgot-link" style="display:inline;">Click here</a> to resend.
      </p>

      <#if isAppInitiatedAction??>
      <form action="${url.loginAction}" method="post">
        <button type="submit" class="btn btn-primary">Resend verification email</button>
        <button type="submit" name="cancel-aia" value="true" class="btn btn-outline">Cancel</button>
      </form>
      </#if>
    </div>
  </main>
</body>
</html>
