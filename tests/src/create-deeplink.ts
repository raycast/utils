import { createDeeplink, DeeplinkType } from "../../src/index";
import { exec } from "node:child_process";

function testDeeplink(deeplink: string) {
  console.log(deeplink);
  exec(`open ${deeplink}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
}

export default async function () {
  // raycast://script-commands/count-chars?arguments=a%20b%2Bc%2520d
  testDeeplink(createDeeplink({
    type: DeeplinkType.ScriptCommand,
    command: "count-chars",
    arguments: ["a b+c%20d"]
  }))

  // raycast://extensions/Aayush9029/cleanshotx/capture-previous-area?arguments=%7B%22action%22%3A%22copy%22%7D
  // testDeeplink(createDeeplink({
  //   type: DeeplinkType.Extension,
  //   ownerOrAuthorName: "Aayush9029",
  //   extensionName: "cleanshotx",
  //   command: "capture-previous-area",
  //   arguments: {
  //     action: "copy"
  //   }
  // }))

}
