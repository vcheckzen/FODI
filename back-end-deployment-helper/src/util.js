export const generateCode = async (
  reverseProxy,
  loginHost,
  apiHost,
  clientId,
  clientSecret,
  replyURL,
  refreshToken,
  exposePath,
  passwordFilename,
  protectedLayers
) => {
  const constants = 
`const localEnv = {
  PROTECTED: {
    EXPOSE_PATH: "${exposePath}",
    PASSWD_FILENAME: "${passwordFilename}",
    PROTECTED_LAYERS: ${protectedLayers},
    CACHE_TTLMAP: {
      POST: 0,
      GET: 0,
    },
  },
  OAUTH: {
    clientId: "${clientId}",
    clientSecret: "${clientSecret}",
    redirectUri: "${replyURL}",
    refreshToken: "${refreshToken}",
    loginHost: "${loginHost}",
    oauthUrl: "${loginHost}/common/oauth2/v2.0/",
    apiHost: "${apiHost}",
    apiUrl: "${apiHost}/v1.0/me/drive/root",
    scope: "${apiHost}/Files.ReadWrite.All offline_access",
  },
};
`;

  const template = await fetch(
    `${reverseProxy}?url=https://raw.githubusercontent.com/vcheckzen/FODI/refs/heads/master/back-end-cf/index.js`
  )
    .then((data) => data.text())
    .catch(() => '');

  const lines = template.split('\n');
  const targetIndex = lines.findIndex((line) =>
    line.trim().endsWith("localEnv = {};")
  );

  if (targetIndex !== -1) {
    lines[targetIndex] = constants;
    return lines.join('\n');
  } else {
    throw new Error('无法生成代码，请重试或联系管理员');
  }
};
