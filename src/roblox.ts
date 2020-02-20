
import * as BeautifulDom from "beautiful-dom";
import * as request from "request-promise";

interface IDecalUpdateOptions {
    name?: string;
    description?: string;
    imageBuffer?: any;
    groupId?: number;
}

export class RobloxError extends Error {
    public code: number;
    public raw?: any;
    constructor(code: number, message: string, raw?: any) {
        super(message);
        this.code = code;
        this.raw = raw;
    }
}

let lastToken: string | undefined;
export async function robloxRequest(options: request.Options) {
    if (!options.headers) {
        options.headers = { };
    }
    options.headers["x-csrf-token"] = lastToken;
    if (options.json === undefined) {
        options.json = true;
    }
    const resolveWithFullResponse = options.resolveWithFullResponse;
    options.resolveWithFullResponse = true;
    try {
        const response = await request.default(options);
        if (response.headers["x-csrf-token"]) {
            lastToken = response.headers["x-csrf-token"];
        }
        options.resolveWithFullResponse = resolveWithFullResponse;
        if (resolveWithFullResponse) {
            return response;
        } else {
            return response.body;
        }
    } catch (error) {
        options.resolveWithFullResponse = resolveWithFullResponse;
        if (error.response?.headers["x-csrf-token"]) {
            lastToken = error.response?.headers["x-csrf-token"];
        }
        const retry = error.response?.statusCode === 403 && (error.response?.statusMessage === "XSRF Token Validation Failed" || error.response?.statusMessage === "Token Validation Failed");
        if (retry) {
            options.headers["x-csrf-token"] = lastToken;
            return await request.default(options);
        }
        throw error;
    }
}

export async function getRegistryCookie() {
    try {
        const Registry: WinregStatic = require("winreg");
        const regKey = new Registry({
            hive: Registry.HKCU,
            key: "\\Software\\Roblox\\RobloxStudioBrowser\\roblox.com",
        });
        const cookieItem: Winreg.RegistryItem = await new Promise((resolve, reject) => {
            regKey.get(".ROBLOSECURITY", (err, item) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(item);
                }
            });
        });
        const cookieMatches = cookieItem.value.match("COOK::<([^>]+)>");
        return cookieMatches[1];
    } catch (err) {
        console.log("Failed to get cookie from registry:", err);
        return undefined;
    }
}

export async function robloxLogin(username: string, password: string) {
    const jar = request.jar();
    const response = await robloxRequest({
        method: "POST",
        url: "https://auth.roblox.com/v2/login",
        body: {
            ctype: "Username",
            cvalue: username,
            password: password,
        },
        jar: jar,
    });
    for (const cookie of jar.getCookies("https://auth.roblox.com/v2/login")) {
        if (cookie.key === ".ROBLOSECURITY") {
            return cookie.value;
        }
    }
    throw new Error("No cookie returned");
}

export async function decalUpload(options: IDecalUpdateOptions, cookie: string) {
    let result;
    try {
        result = await robloxRequest({
            method: "POST",
            url: `http://data.roblox.com/data/upload/json?assetTypeId=13&name=${options.name || ""}&description=${options.description || ""}&groupId=${options.groupId || ""}`,
            headers: {
                "Cookie": cookie,
                "Host": "data.roblox.com",
                "Content-type": "*/*",
                "User-Agent": "Roblox/WinInet",
            },
            body: options.imageBuffer,
            json: false,
        });
    } catch (error) {
        throw new RobloxError(-1, `Unknown error: ${error}`, error);
    }
    let data;
    try {
        data = JSON.parse(result);
    } catch (error) {
        throw new RobloxError(-1, `Unknown error: ${error}`, error);
    }
    if (!data.Success) {
        if (data.Message && data.Message.toLowerCase().search("you are uploading too much") !== -1) {
            throw new RobloxError(1, `Uploading too much`, data);
        } else if (data.Message && data.Message.toLowerCase().search("inappropriate") !== -1) {
            throw new RobloxError(2, `Inappropriate Text`, data);
        } else {
            throw new RobloxError(-1, `Unknown error: ${data.Message}`, data);
        }
    }
    return {
        decalId: data.AssetId,
        imageId: data.BackingAssetId,
    };
}

export async function myUserInfo(cookie: string) {
    let result;
    try {
        result = await robloxRequest({
            method: "GET",
            url: "https://www.roblox.com/mobileapi/userinfo",
            headers: {
                Cookie: cookie,
            },
        });
    } catch (error) {
        throw new RobloxError(-1, `Unknown error: ${error}`, error);
    }
    if (!result) {
        throw new RobloxError(1, "Not logged in");
    }
    return {
        userId: result.UserID,
        username: result.UserName,
        robux: result.RobuxBalance,
        isPremium: result.IsPremium,
        thumbnailUrl: result.ThumbnailUrl,
    };
}

export async function groupInfo(groupId: number, cookie: string) {
    let result;
    try {
        result = await robloxRequest({
            method: "GET",
            url: `https://api.roblox.com/groups/${groupId}`,
            headers: {
                Cookie: cookie,
            },
        });
    } catch (error) {
        throw new RobloxError(-1, `Unknown error: ${error} (group probably does not exit)`, error);
    }
    if (!result) {
        throw new RobloxError(-1, "Unknown error");
    }
    const roles = [];
    for (const role of result.Roles) {
        roles.push({
            name: role.Name,
            rank: role.Rank,
        });
    }
    return {
        name: result.Name,
        groupId: result.Id,
        owner: {
            username: result.Owner.Name,
            userId: result.Owner.Id,
        },
        emblemUrl: result.EmblemUrl,
        description: result.Description,
        roles: roles,
    };
}

export async function userGroups(userId: number, cookie: string) {
    let result;
    try {
        result = await robloxRequest({
            method: "GET",
            url: `https://api.roblox.com/users/${userId}/groups`,
            headers: {
                Cookie: cookie,
            },
        });
    } catch (error) {
        throw new RobloxError(-1, `Unknown error: ${error} (group probably does not exit)`, error);
    }
    if (!result) {
        throw new RobloxError(-1, "Unknown error");
    }
    const groups = [];
    for (const group of result) {
        groups.push({
            groupId: group.Id,
            name: group.Name,
            emblemId: group.EmblemId,
            emblemUrl: group.EmblemUrl,
            rank: group.Rank,
            role: group.Role,
            isPrimary: group.IsPrimary,
        });
    }
    return groups;
}
