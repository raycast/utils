module.exports = {
  Clipboard: { copy: (noop) => noop },
  LaunchType: { Background: "background", UserInitiated: "userInitiated" },
  environment: { launchType: "userInitiated" },
  open: (noop) => noop,
  showToast: (noop) => noop,
};
