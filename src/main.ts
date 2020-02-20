import * as toml from "@iarna/toml";
import * as commandLineArgs from "command-line-args";
import * as commandLineUsage from "command-line-usage";
import * as delay from "delay";
import * as fs from "fs-extra";
import * as glob from "glob";
import * as path from "path";
import * as rbxupload from "./rbxupload";
import * as roblox from "./roblox";

function oneOf(arr: string[]) {
    return (input: string) => {
        if (arr.indexOf(input) === -1) {
            throw new Error("Expected one of " + arr.join(", "));
        }
        return input;
    };
}

const skipValues = ["user", "user-verify", "group", "group-verify", "files", "files-verify", "type", "id", "name", "description"];
const assetTypeValues = ["auto", "decal"]; // , "image", "shirt", "pants", "tshirt", "model", "animation", "place"];

const assetTypeExtensions: any = { };
assetTypeExtensions.decal = [".png", ".jpg", ".jpeg"];
// assetTypeExtensions.image = assetTypeExtensions.decal;
// assetTypeExtensions.shirt = assetTypeExtensions.decal;
// assetTypeExtensions.pants = assetTypeExtensions.decal;
// assetTypeExtensions.tshirt = assetTypeExtensions.decal;
// assetTypeExtensions.model = [".rbxm"];
// assetTypeExtensions.animation = assetTypeExtensions.model;
// assetTypeExtensions.place = [".rbxl", ".rbxlx"];

const cmdOptionsDefinitions = [
    { name: "help", alias: "h", type: Boolean, description: "Display this help message"},
    { name: "?", alias: "?", type: Boolean, description: "Display this help message"},
    { name: "files", type: String, multiple: true, description: "Files to upload", defaultOption: true},
    { name: "registry", alias: "r", type: Boolean, description: "Log in to Roblox using Roblox Studio's cookie from the registry"},
    { name: "no-interactive", type: Boolean, description: "Don't use interactive mode"},
    { name: "skip", type: oneOf(skipValues), multiple: true, description: "Skip interactive prompts for specific values"},
    { name: "group", type: Number, description: "Group to upload to."},
    { name: "type", type: oneOf(assetTypeValues), description: "Type of asset to upload as"},
    // { name: "id", type: Number, description: "Existing asset id to upload to"},
    { name: "name", type: String, description: "Name of asset. Defaults to the file name."},
    { name: "name-retry", type: String, description: "Fallback name if upload fails due to text filtering."},
    { name: "description", type: String, description: "Description of asset"},
    { name: "description-retry", type: String, description: "Fallback description if upload fails due to text filtering."},
];

const cmdOptionsGuide = [
    {
        header: "RbxUpload",
        content: [
            "A utility to upload files to Roblox.",
        ],
    },
    {
        header: "Logging In",
        content: [
            "This utility needs to log in to Roblox to create and update developer products.",
            "You have two choices:",
            "- Retrieve the cookie from Roblox Studio's registry on Windows using the {bold -r --registry} option",
            "- Set the {bold ROBLOX_COOKIE} environment variable to the ROBLOSECURITY cookie",
            "The {bold -r --registry} arguments will take priority over the ROBLOX_COOKIE environment variable",
        ],
    },
    {
        header: "Options",
        optionList: cmdOptionsDefinitions,
    },
];

(async () => {
    let cmdOptions;
    try {
        cmdOptions = commandLineArgs.default(cmdOptionsDefinitions);
    } catch (error) {
        console.error(error.message);
        console.log ("Try devprod --help");
        return;
    }

    cmdOptions.files = cmdOptions.files || [];
    cmdOptions.skip = cmdOptions.skip || [];

    if (cmdOptions.help || cmdOptions["?"]) {
        console.log(commandLineUsage.default(cmdOptionsGuide));
        return;
    }

    function shouldSkip(name) {
        return cmdOptions["no-interactive"] || (cmdOptions.skip as string[]).indexOf(name) !== -1;
    }

    if (!cmdOptions.registry && !process.env.ROBLOX_COOKIE) {
        if (shouldSkip("user")) {
            console.error("No user details provided and not in interactive mode. Cannot log in.");
            process.exit(1);
        }
        const input = (await rbxupload.askQuestion("Attempt to log in using the registry? [Y/n] ")).toLowerCase().trim();
        if (input !== "" && input !== "y") {
            console.error("User cancelled");
            process.exit(1);
        }
        cmdOptions.registry = true;
    }

    let cookie;
    if (cmdOptions.registry) {
        try {
            cookie = `.ROBLOSECURITY=${await roblox.getRegistryCookie()};`;
        } catch (error) {
            console.error(`Failed to get cookie from the registry: ${error.message}`);
            return;
        }
    } else if (process.env.ROBLOX_COOKIE) {
        cookie = process.env.ROBLOX_COOKIE;
        if (!cookie.startsWith(".ROBLOSECURITY=")) {
            cookie = `.ROBLOSECURITY=${cookie};`;
        }
    } else {
        console.error("You need to log in to do that. Try devprod --help");
        return;
    }

    if (cmdOptions.files.length === 0) {
        if (shouldSkip("files")) {
            console.error("No files provided and files interactivity is skipped. Nothing to do.");
        }
        const input = await rbxupload.askQuestion(`What files do you want to upload? `);
        cmdOptions.files.push(input);
    }

    const filesRaw: string[] = [];
    const filePromises = [];
    for (const fileGlob of cmdOptions.files) {
        filePromises.push(new Promise((resolve, reject) => {
            glob.default(fileGlob, { mark: true}, (err, result) => {
                if (err) {
                    reject(err);
                }
                for (const file of result) {
                    if (!(file as string).endsWith("/")) {
                        filesRaw.push(file);
                    }
                }
                resolve();
            });
        }));
    }
    try {
        await Promise.all(filePromises);
    } catch (error) {
        console.error(`Failed to get files because: ${error.message}`);
        process.exit(1);
    }

    if (filesRaw.length === 0) {
        console.error(`No files found. Nothing to do.`);
        process.exit(1);
    }

    if (!cmdOptions.type) {
        if (!shouldSkip("type")) {
            let input = (await rbxupload.askQuestion("What kind asset do you want to upload? [AUTO/decal] ")).toLowerCase().trim();
            if (input === "") {
                input = "auto";
            }
            if (["image", "auto"].indexOf(input) === -1) {
                console.error("Invalid asset type");
                process.exit(1);
            }
            cmdOptions.type = input;
        }
    }

    const files = {
        decal: [],
        unknown: [],
    };

    for (const file of filesRaw) {
        let assetType = cmdOptions.type;
        if (assetType === "auto") {
            for (const assetTypeName of Object.keys(assetTypeExtensions)) {
                for (const extension of assetTypeExtensions[assetTypeName]) {
                    if (file.toLowerCase().endsWith(extension)) {
                        assetType = assetTypeName;
                        break;
                    }
                }
                if (assetType !== "auto") {
                    break;
                }
            }
            if (assetType === "auto") {
                assetType = "unknown";
            }
        }
        files[assetType].push(file);
    }

    let verifyCount = 0;

    if (!shouldSkip("files-verify")) {
        console.log("Files to upload:");
        for (const assetType of Object.keys(files)) {
            const list = files[assetType];
            if (list.length !== 0) {
                if (list.length > 10) {
                    console.log(`  ${assetType}: ${list.length} (hidden)`);
                } else {
                    console.log(`  ${assetType}: ${list.length}`);
                    for (const file of list) {
                        console.log(`    ${file}`);
                    }
                }
                if (assetType === "unknown") {
                    console.log("  ...to be ignored because their asset type is unknown");
                }
            }
        }
        verifyCount++;
    }

    let userInfo;
    try {
        userInfo = await roblox.myUserInfo(cookie);
    } catch (error) {
        console.error(`Failed to get logged in user info because: ${error.message}`);
        process.exit(1);
    }

    if (!shouldSkip("user-verify")) {
        console.log(`You are logged in as ${userInfo.username} (${userInfo.userId})`);
        verifyCount++;
    }

    if (!cmdOptions.group && !shouldSkip("group")) {
        const input = (await rbxupload.askQuestion("Upload to a group? [Enter a group id/name] ")).trim();
        if (input !== "") {
            let inputGroupId = Number.parseInt(input, 10);
            if (inputGroupId !== inputGroupId || inputGroupId <= 0) {
                try {
                    const groups = await roblox.userGroups(userInfo.userId, cookie);
                    for (const group of groups) {
                        if ((group.name as string).search(new RegExp(input, "i")) !== -1 || group.isPrimary && input.toLowerCase() === "primary") {
                            console.log(`Using group id ${group.groupId} from group ${group.name}`);
                            inputGroupId = group.groupId;
                            break;
                        }
                    }
                } catch (error) {
                    console.warn(`Could not fetch groups for user because: ${error.message}`);
                }
                if (inputGroupId !== inputGroupId || inputGroupId <= 0) {
                    console.error("Invalid group id and could not match text with one of your groups");
                    process.exit(1);
                }
            }
            cmdOptions.group = inputGroupId;
        }
    }

    if (cmdOptions.group) {
        let groupInfo;
        try {
            groupInfo = await roblox.groupInfo(cmdOptions.group, cookie);
        } catch (error) {
            console.error(`Failed to get group info for ${cmdOptions.group} because: ${error.message}`);
            process.exit(1);
        }

        if (!shouldSkip("group-verify")) {
            console.log(`You are uploading to ${groupInfo.name} (${groupInfo.groupId})`);
            verifyCount++;
        }
    }

    if (verifyCount > 0) {
        const input = (await rbxupload.askQuestion(`Are these settings okay? [y/N] `)).toLowerCase().trim();
        if (input !== "y") {
            console.error("User cancelled");
            process.exit(1);
        }
    }

    if (!cmdOptions.name) {
        if (!shouldSkip("name")) {
            const input = (await rbxupload.askQuestion("What should these assets be named? '$file' will be replaced with the file name. [default: $file] ")).trim();
            if (input !== "") {
                cmdOptions.name = input;
            }
        }
        if (!cmdOptions.name) {
            cmdOptions.name = "$file";
        }
    }

    if (!cmdOptions.description) {
        if (!shouldSkip("description")) {
            const input = (await rbxupload.askQuestion("What should the description be? '$file' will be replaced with the file name. [default: <empty>] ")).trim();
            cmdOptions.description = input;
        } else {
            cmdOptions.description = "";
        }
    }

    for (const file of files.decal) {
        let imageBuffer: Buffer;
        try {
            imageBuffer = await fs.readFile(file);
        } catch (error) {
            console.error(`${file}: FAILED because: Cannot open file: ${error.message}`);
        }
        if (imageBuffer) {
            let name = (cmdOptions.name as string).replace("$file", path.basename(file));
            let description = (cmdOptions.description as string).replace("$file", path.basename(file));
            let filteringRetried = !(cmdOptions["name-retry"] || cmdOptions["description-retry"]);
            while (true) {
                try {
                    const data =  await roblox.decalUpload({
                        groupId: cmdOptions.group,
                        name: name,
                        description: description,
                        imageBuffer: imageBuffer,
                    }, cookie);
                    console.log(`${file}: rbxassetid://${data.imageId}`);
                    break;
                } catch (error) {
                    if (error.code === 1) {
                        console.error(`${file}: retrying in 35 seconds because: rate limiting`);
                        await delay.default(35);
                    } else if (error.code === 2) {
                        if (filteringRetried) {
                            console.error(`${file}: FAILED because: text filtering`);
                            break;
                        } else {
                            console.error(`${file}: retrying because: text filtering`);
                            filteringRetried = true;
                            name = cmdOptions["name-retry"] || "Asset";
                            description = cmdOptions["description-retry"] || "";
                        }
                    } else {
                        console.error(`${file}: FAILED because: ${error.message}`);
                        break;
                    }
                }
            }
        }
    }
})();
