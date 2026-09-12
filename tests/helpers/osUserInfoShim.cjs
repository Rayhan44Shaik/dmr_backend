// The Windows CI/desktop host can intermittently fail uv_os_get_passwd with
// ENOMEM before tsx starts. Tests only need a stable name for tsx's temp path.
const os = require("node:os");

const originalUserInfo = os.userInfo;

os.userInfo = (...args) => {
  try {
    return originalUserInfo(...args);
  } catch (error) {
    if (error?.code !== "ERR_SYSTEM_ERROR" || error?.syscall !== "uv_os_get_passwd") {
      throw error;
    }

    return {
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || "codex-test",
      homedir: process.env.USERPROFILE || os.tmpdir(),
      shell: null,
    };
  }
};
