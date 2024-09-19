export const generateCode = async (
  reverseProxy,
  loginHost,
  apiHost,
  clientId,
  clientSecret,
  replayURL,
  refreshToken,
  exposePath,
  passwordFilename,
  protectedLayers,
  exposePw
) => {
  const constants = `const EXPOSE_PATH = "${exposePath}";
const ONEDRIVE_REFRESHTOKEN = "${refreshToken}";
const PASSWD_FILENAME = "${passwordFilename}";
const PROTECTED_LAYERS = ${protectedLayers};
const EXPOSE_PASSWD = "${exposePw}";
const clientId = "${clientId}";
const clientSecret = "${clientSecret}";
const loginHost = "${loginHost}";
const apiHost = "${apiHost}";
const redirectUri = "${replayURL}"

`;

  const template = await fetch(
    `${reverseProxy}?url=https://raw.githubusercontent.com/vcheckzen/FODI/refs/heads/master/back-end-cf/index.js`
  )
    .then((data) => data.text())
    .catch(() => '');

  const lines = template.split('\n');
  const targetIndex = lines.findIndex((line) =>
    line.trim().startsWith("addEventListener('scheduled'")
  );

  if (targetIndex !== -1) {
    const remainingLines = lines.slice(targetIndex); // Keep only the lines starting from the target
    const logic = remainingLines.join('\n');
    return constants + logic;
  } else {
    throw new Error('无法生成代码，请重试或联系管理员');
  }
};
