Install with node and `npm install -g rbxupload` or download packaged binaries from [the releases page](https://github.com/Corecii/RbxUpload/releases).

# RbxUpload

RbxUpload is a tool to upload assets to Roblox.

## Features

* Upload multiple files at once; glob support
* Log in with your Roblox Studio cookie
* Upload to groups
* Outputs image ids, not decal ids
* Optional name and description
* Retry with fallback name on text filtering errors
* Pixelfix/alpha-bleed built in
* Interactive mode
* Skip any or all of interactive mode
* Confirm user and group before upload

## Options

On Windows, RbxUpload can retrieve your Roblox Studio cookie automatically so you do not have to provide login details or a cookie. Alternatively, you can set the `ROBLOX_COOKIE` environment variable. RbxUpload does not provide a mechanism for logging in and does not permit passwords or cookies in the command line arguments.

```plain
  -h, --help                   Display this help message
  -?, --?                      Display this help message
  --files string[]             Files to upload
  -r, --registry               Log in to Roblox using Roblox Studio's cookie from the registry
  --no-interactive             Don't use interactive mode
  --skip                       Skip interactive prompts for specific values. Valid values: user, user-
                               verify, group, group-verify, files, files-verify, type, id, name,
                               description, name-retry, pixelfix, done
  --group number               Group to upload to
  --type                       Type of asset to upload as. Valid values: auto, decal
  --name string                Name of asset. '$file' will be replaced with the file name. Defaults to $file
  --description string         Description of asset. Supports $file. Defaults to <blank>
  --name-retry string          Fallback name if upload fails due to text filtering. Does not support $file.
  --description-retry string   Fallback description if upload fails due to text filtering. Does not support
                               $file.
  --pixelfix                   Use pixelfix to alpha bleed images before upload. Alpha-bleed is not saved to
                               the file.
```

## Tips

On windows, you can add RbxUpload to your Send To menu:
1. Install RbxUpload
2. Copy-and-paste `%AppData%\Microsoft\Windows\SendTo` into File Explorer
3. Create a shortcut in SendTo...
    * If you downloaded RbxUpload from the releases page:
        1. Put RbxUpload somewhere recognizable like `C:\`
	    2. Rename it `rbxupload` or `rbxupload.exe`
	    3. Copy-and-paste the following for the item location: `C:\rbxupload.exe --registry --skip name description --type decal --name-retry "Asset" --pixelfix`
	* If you used `npm install -g rbxupload`:
	    1. Copy-and-paste the following for the item location: `rbxupload --registry --skip name description --type decal --name-retry "Asset" --pixelfix`
4. Give the shortcut a good name like "Roblox Decal"
5. Use "Send To -> Roblox Decal" to easily upload decals to Roblox