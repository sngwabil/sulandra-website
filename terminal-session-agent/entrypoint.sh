#!/usr/bin/env bash
set -euo pipefail

cd /workspace
if [[ ! -d .git ]]; then
  git init -b workbench >/dev/null 2>&1 || git init >/dev/null 2>&1
  git config user.name "Sulandra Terminal"
  git config user.email "terminal@sulandra.local"
  git add -A
  git commit -m "Isolated terminal workspace baseline" --no-gpg-sign >/dev/null 2>&1 || true
fi

IDE_PORT="${SULANDRA_IDE_PORT:-13337}"
CODE_SERVER_DATA="${HOME}/.local/share/code-server"
mkdir -p "${HOME}/.config/code-server" "${CODE_SERVER_DATA}/User"

# This embedded IDE belongs to Sulandra IT Solutions. Disable upstream VS Code
# AI/Copilot surfaces so SIA remains the only assistant presented to the user.
# Keep the normal VS Code Welcome/Start page so New File/Open File and the
# standard editor entry points remain available without restoring AI onboarding.
# The Sulandra-owned color profile mirrors the Engineering Workspace navy/teal
# surface so the embedded editor feels continuous with the parent application.
cat > "${CODE_SERVER_DATA}/User/settings.json" <<'JSON'
{
  "chat.disableAIFeatures": true,
  "workbench.settings.applyToAllProfiles": [
    "chat.disableAIFeatures",
    "workbench.colorTheme",
    "workbench.colorCustomizations",
    "editor.tokenColorCustomizations"
  ],
  "workbench.startupEditor": "welcomePage",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "window.autoDetectColorScheme": false,
  "workbench.preferredDarkColorTheme": "Default Dark Modern",
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.colorCustomizations": {
    "foreground": "#D7EDF7",
    "focusBorder": "#24D389",
    "descriptionForeground": "#86A8BB",
    "errorForeground": "#FF9B9B",
    "icon.foreground": "#9DC7DA",
    "textLink.foreground": "#64C7E8",
    "textLink.activeForeground": "#8FE0F5",

    "window.activeBorder": "#24D389",
    "window.inactiveBorder": "#173B4C",

    "titleBar.activeBackground": "#071925",
    "titleBar.activeForeground": "#D7EDF7",
    "titleBar.inactiveBackground": "#06131D",
    "titleBar.inactiveForeground": "#7094A7",

    "activityBar.background": "#06131D",
    "activityBar.foreground": "#D7EDF7",
    "activityBar.inactiveForeground": "#7094A7",
    "activityBar.activeBorder": "#24D389",
    "activityBarBadge.background": "#24D389",
    "activityBarBadge.foreground": "#041219",

    "sideBar.background": "#071925",
    "sideBar.foreground": "#C9E2ED",
    "sideBar.border": "#173B4C",
    "sideBarTitle.foreground": "#D7EDF7",
    "sideBarSectionHeader.background": "#0A2230",
    "sideBarSectionHeader.foreground": "#D7EDF7",
    "sideBarSectionHeader.border": "#173B4C",

    "editorGroupHeader.tabsBackground": "#071925",
    "editorGroupHeader.tabsBorder": "#173B4C",
    "editorGroup.border": "#173B4C",
    "tab.activeBackground": "#0C2A3B",
    "tab.activeForeground": "#E8F6FC",
    "tab.inactiveBackground": "#071925",
    "tab.inactiveForeground": "#86A8BB",
    "tab.activeBorderTop": "#24D389",
    "tab.border": "#173B4C",

    "editor.background": "#06131D",
    "editor.foreground": "#D7EDF7",
    "editorLineNumber.foreground": "#4E788B",
    "editorLineNumber.activeForeground": "#9DC7DA",
    "editorCursor.foreground": "#50E39A",
    "editor.selectionBackground": "#17495F",
    "editor.inactiveSelectionBackground": "#10384B",
    "editor.lineHighlightBackground": "#09202C",
    "editorIndentGuide.background1": "#173B4C",
    "editorIndentGuide.activeBackground1": "#315C70",
    "editorWhitespace.foreground": "#23495A",
    "editor.findMatchBackground": "#8A6B1F",
    "editor.findMatchHighlightBackground": "#55451F",

    "editorWidget.background": "#0A2230",
    "editorWidget.foreground": "#D7EDF7",
    "editorWidget.border": "#28536A",
    "editorSuggestWidget.background": "#0A2230",
    "editorSuggestWidget.foreground": "#D7EDF7",
    "editorSuggestWidget.border": "#28536A",
    "editorSuggestWidget.selectedBackground": "#12384B",

    "peekView.border": "#24D389",
    "peekViewEditor.background": "#06131D",
    "peekViewResult.background": "#071925",
    "peekViewTitle.background": "#0A2230",

    "panel.background": "#06131D",
    "panel.border": "#28536A",
    "panelTitle.activeForeground": "#D7EDF7",
    "panelTitle.inactiveForeground": "#7094A7",
    "panelTitle.activeBorder": "#24D389",

    "terminal.background": "#06131D",
    "terminal.foreground": "#D7EDF7",
    "terminalCursor.foreground": "#50E39A",
    "terminal.selectionBackground": "#17495F",
    "terminal.ansiBlack": "#071925",
    "terminal.ansiRed": "#FF8E8E",
    "terminal.ansiGreen": "#50E39A",
    "terminal.ansiYellow": "#F3C969",
    "terminal.ansiBlue": "#64C7E8",
    "terminal.ansiMagenta": "#C7A0F5",
    "terminal.ansiCyan": "#6BE0D0",
    "terminal.ansiWhite": "#D7EDF7",
    "terminal.ansiBrightBlack": "#7094A7",
    "terminal.ansiBrightRed": "#FFB1B1",
    "terminal.ansiBrightGreen": "#8FE6BB",
    "terminal.ansiBrightYellow": "#FFE29A",
    "terminal.ansiBrightBlue": "#9ADCF2",
    "terminal.ansiBrightMagenta": "#DEC2FF",
    "terminal.ansiBrightCyan": "#A2F0E5",
    "terminal.ansiBrightWhite": "#F2FBFF",

    "statusBar.background": "#0C2A3B",
    "statusBar.foreground": "#D7EDF7",
    "statusBar.border": "#28536A",
    "statusBar.debuggingBackground": "#5B3D72",
    "statusBar.noFolderBackground": "#0A2230",
    "statusBarItem.hoverBackground": "#17495F",
    "statusBarItem.remoteBackground": "#0F5B68",
    "statusBarItem.remoteForeground": "#E8F6FC",

    "input.background": "#071925",
    "input.foreground": "#D7EDF7",
    "input.border": "#28536A",
    "input.placeholderForeground": "#7094A7",
    "inputOption.activeBackground": "#12384B",
    "inputOption.activeBorder": "#24D389",
    "inputValidation.infoBorder": "#64C7E8",
    "inputValidation.warningBorder": "#F3C969",
    "inputValidation.errorBorder": "#FF9B9B",

    "dropdown.background": "#071925",
    "dropdown.foreground": "#D7EDF7",
    "dropdown.border": "#28536A",
    "button.background": "#0F5872",
    "button.foreground": "#F2FBFF",
    "button.hoverBackground": "#176F8D",
    "button.secondaryBackground": "#12384B",
    "button.secondaryForeground": "#D7EDF7",
    "button.secondaryHoverBackground": "#17495F",

    "list.activeSelectionBackground": "#12384B",
    "list.activeSelectionForeground": "#E8F6FC",
    "list.inactiveSelectionBackground": "#0D2C3C",
    "list.hoverBackground": "#0A2735",
    "list.focusBackground": "#12384B",
    "list.focusOutline": "#24D389",
    "list.highlightForeground": "#64C7E8",

    "menu.background": "#071925",
    "menu.foreground": "#D7EDF7",
    "menu.selectionBackground": "#12384B",
    "menu.selectionForeground": "#E8F6FC",
    "menu.border": "#28536A",
    "menu.separatorBackground": "#28536A",

    "commandCenter.background": "#071925",
    "commandCenter.foreground": "#D7EDF7",
    "commandCenter.border": "#28536A",
    "commandCenter.activeBackground": "#12384B",
    "commandCenter.activeBorder": "#24D389",

    "quickInput.background": "#071925",
    "quickInput.foreground": "#D7EDF7",
    "quickInputList.focusBackground": "#12384B",
    "quickInputList.focusForeground": "#E8F6FC",
    "quickInputList.focusIconForeground": "#50E39A",

    "notifications.background": "#0A2230",
    "notifications.foreground": "#D7EDF7",
    "notifications.border": "#28536A",
    "notificationCenter.border": "#28536A",
    "notificationToast.border": "#28536A",

    "badge.background": "#12384B",
    "badge.foreground": "#D7EDF7",
    "progressBar.background": "#24D389",

    "scrollbar.shadow": "#020B10",
    "scrollbarSlider.background": "#315C7070",
    "scrollbarSlider.hoverBackground": "#42758D99",
    "scrollbarSlider.activeBackground": "#50A0BEAA",

    "welcomePage.background": "#06131D",
    "welcomePage.progress.background": "#173B4C",
    "welcomePage.progress.foreground": "#24D389",
    "walkThrough.embeddedEditorBackground": "#071925",

    "settings.headerForeground": "#D7EDF7",
    "settings.modifiedItemIndicator": "#24D389",
    "settings.dropdownBackground": "#071925",
    "settings.dropdownForeground": "#D7EDF7",
    "settings.dropdownBorder": "#28536A",
    "settings.textInputBackground": "#071925",
    "settings.textInputForeground": "#D7EDF7",
    "settings.textInputBorder": "#28536A",

    "gitDecoration.addedResourceForeground": "#50E39A",
    "gitDecoration.modifiedResourceForeground": "#F3C969",
    "gitDecoration.deletedResourceForeground": "#FF9B9B",
    "gitDecoration.untrackedResourceForeground": "#6BE0D0",
    "gitDecoration.conflictingResourceForeground": "#FFB067",
    "gitDecoration.ignoredResourceForeground": "#5D7F8E"
  },
  "editor.tokenColorCustomizations": {
    "comments": "#6F94A6",
    "strings": "#8FE6BB",
    "numbers": "#F3C969",
    "keywords": "#7EC8FF",
    "functions": "#D7EDF7",
    "variables": "#E8F6FC",
    "types": "#6BE0D0"
  }
}
JSON

# The session agent owns PORT=9000. code-server also honors PORT, so scope its
# environment to the dedicated IDE port. Keep the IDE loopback-only; the
# authenticated session-agent bridge is the only network path into it. Use the
# absolute binary path so session startup does not depend on a shell PATH that
# can differ between production and Docker-based verification environments.
PORT="${IDE_PORT}" /usr/local/bin/code-server \
  --bind-addr "127.0.0.1:${IDE_PORT}" \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --disable-getting-started-override \
  --user-data-dir "${CODE_SERVER_DATA}" \
  /workspace >/tmp/sulandra-code-server.log 2>&1 &

exec node /agent/server.mjs
