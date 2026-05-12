<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Link account – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Link your account</h1>
      <p class="subheading">
        A WODalytics account already exists with this email address.
        You can link your ${idpDisplayName} account to it.
      </p>

      <form action="${url.loginAction}" method="post">
        <button type="submit" name="submitAction" value="linkAccount" class="btn btn-primary">
          Link to existing account
        </button>
        <button type="submit" name="submitAction" value="updateProfile" class="btn btn-outline">
          Use a different email
        </button>
      </form>
    </div>
  </main>
</body>
</html>
