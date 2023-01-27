console.log("Starting now...");

const http = require('http'); // or 'https' for https:// URLs
const fs = require('fs');
const execSync = require('child_process').execSync;

function pathToLocalPath(path) {
    return "docs/" + path;
}

function fileReadWhole(path) {
    return fs.readFileSync(pathToLocalPath(path));
}

function fileExists(path) {
    return fs.existsSync(path);
}

function folderFromPath(path) {
    var end = path.lastIndexOf("/");
    if (end >= 0) {
        return path.substr(0,end+1);
    }
    return "";
}

function splitHTML( text) {
    var parts = [];
    var elementDepth = 0;
    var currentPart = null;
    var quote = false;
    for (var i in text) {
        var index = i;
        var letter = text[index];
        if (letter == "<") {
            elementDepth++;
            currentPart = null;
        } else if (letter == ">") {
            elementDepth--;
            currentPart = null;
        } else if ((letter == "\"") || (letter == "'")) {
            quote = !quote;
            elementDepth += (quote ? 1 : -1);
            currentPart = null;
        } else {
            if (!currentPart) {
                currentPart = {
                    depth : elementDepth,
                    is_plain_text : (elementDepth == 0),
                    text : "",
                };
                parts.push(currentPart);
            }
            currentPart.text += letter;
        }
    }

    return parts;
}

function cleanWhiteSpace(str) {
    if (str === undefined) return undefined;
    if (str == "") return "";

    var ans = "";
    for (var i in str) {
        switch (str[i]) {
            case "\n":
            case "\r":
            case "\t":
                ans += " ";
                break;
            default:
                ans += str[i];
                break;
        }
    }
    while (ans.includes("  ")) {
        ans = ans.replace("  "," ");
    }
    ans = ans.trim();
    return ans;
}

function replaceSquares(subtitle) {
    if (subtitle.trim() == "") return "";
    if (subtitle.includes("[")) {
        var ans = "";
        var index = subtitle.indexOf("[");
        var left = subtitle.substr(0,index);
        var right = subtitle.substr(index+1).replace("]","");
        return "\n " + left + "<span class='pcell_cat'>\n [" + right + "]</span>";
    }
    return "\n " + subtitle;
}

function cellToHtml(cell) {

    var ans = "";

    if (cell.path) {
        ans += "<a href=\"view.html?path=" + cell.path + "\" class='pcell_link' >";
    }

    if (cell.thumbnail) {
        ans += "<img src=\"" + cell.thumbnail + "\" class='pcell_image' />";
    }

    if (cell.path) {
        ans += "</a>";
    }

    return ans;
}

function isPathAFolder(path) {
    return fs.lstatSync(path).isDirectory() 
}

function collectImagesInFolderRecursive(path)
{
    var files = fs.readdirSync(path);
    var result = [];
    for (var fi in files) {
        var subPath = files[fi];
        if (subPath.startsWith(".")) {
            continue;
        }
        var fullPath = path + "/" + subPath;
        if (isPathAFolder(fullPath)) {
            //fullPath += "/";
            var subFiles = collectImagesInFolderRecursive(fullPath);
            for (var si in subFiles) {
                result.push(subFiles[si]);
            }
        } else {
            result.push(fullPath);
        }
    }
    return result;
}

function getImageStatSingle(path, statName)
{
    var cmd = 'sips -g ' + statName + ' \"' + path + "\" ";
    var text = "" + execSync(cmd);
    var parts = text.trim().split(" ");
    var last = parts[parts.length-1].trim();
    if (!isNaN(last)) {
        last = 1 * last;
    }
    return last;
}

function getImageStats(path)
{
    var ans = {
        width : getImageStatSingle(path, "pixelWidth"),
        height : getImageStatSingle(path, "pixelHeight"),
    };
    if (ans.height > ans.width) {
        ans.tall = true;
    }
    return ans;
}

function cleanPaintingsList(objList) {
    var ans = [];
    for (var i in objList) {
        var item = objList[i];
        if (item.path.includes("Thumbs.db")) {
            continue;
        }
        ans.push( item );
    }
    return ans;
}

function getPaintingsList() {
    const txt = fs.readFileSync("webbuild/all_content.json");
    const obj = JSON.parse(txt);
    var cleaned = cleanPaintingsList(obj);
    return cleaned;
}

function updatePaintingsList(paintingsList) {
    var text = JSON.stringify(paintingsList, null, 2);
    var outFile = "webbuild/all_content.json";
    fs.writeFileSync(outFile,text);
    console.log("Wrote file '" + outFile + "'...");
}

function thumbnailPathFor(orig_path) {
    var path = orig_path;
    var prevPath = "";
    var maxCount = 10;
    while (path != prevPath) {
        prevPath = path;
        maxCount--;
        if (maxCount <= 0) {
            throw "Error in thumbnailPathFor";
        }
        path = path
            .replace("original/","smaller/")
            .replace("'","_")
            .replace(")","")
            .replace("(","")
            .replace(" ","_");
    }
    return path;
}

function generateThumbnailsFromJson()
{
    var list = getPaintingsList();
    for (var li in list) {
        var item = list[li];
        if (!item.path) continue; // error
        if (item.thumbnail) continue; // already exists
        item.thumbnail = thumbnailPathFor(item.path);
        if (!fileExists(item.thumbnail)) {
            var folderPath = folderFromPath(item.thumbnail);
            var mkdir = "mkdir -p \"" + folderPath + "\" ";
            execSync(mkdir);
            var cmd = "sips -Z 200 ";
            cmd += " \"" + item.path + "\" ";
            cmd += " --out \"" + item.thumbnail + "\" ";
            console.log(cmd);
            execSync(cmd);
            if (!fileExists(item.thumbnail)) {
                throw "Error creating " + item.thumbnail;
            }
        }
    }
    updatePaintingsList(list);
}

function collectJsonFromFiles()
{
    console.log("Collecting JSON file...");
    var images = collectImagesInFolderRecursive("original");
    var result = [];
    for (var i in images) {
        var imgPath = images[i];

        var obj = {
            path : imgPath,
        };

        var addSizes = true;
        if (addSizes) {
            var stats = getImageStats(imgPath);
            obj.size = stats;
        }
        result.push(obj);
    }

    console.log("Got " + result.length + " items.");

    var writeOutJson = true;
    if (writeOutJson) {
        var text = JSON.stringify(result, null, 2);
        var outFile = "webbuild/all_content.json";
        fs.writeFileSync(outFile,text);
        console.log("Wrote file '" + outFile + "'...");
    }

    return result;
}

function collectCells() {
    var cells = [];
    var content = "" + fileReadWhole("lg/aboutme.html");
    var tds = content.split("<td");
    for (var ti in tds) {
        var td = ((ti==0)?"":"<td") + tds[ti];
        //console.log(td);
        var parts = splitHTML(td);
        var cell = {
            plain_text : "",
        };
        cells.push(cell);
        var isTitle = false;
        for (var pi in parts) {
            var p = parts[pi];
            var pi_next = (1*pi) + 1;
            if (p.is_plain_text)  {
                cell.plain_text += p.text;
                if (isTitle) {
                    if (!cell.title) cell.title = "";
                    cell.title += p.text;
                } else {
                    if (!cell.subtitle) cell.subtitle = "";
                    cell.subtitle += p.text;
                }
            } else {
                if (p.text.startsWith("br")) {
                    cell.plain_text += " ";
                }
                if (p.text.startsWith("a") && p.depth==1) {
                    isTitle = true;
                }
                if (p.text.startsWith("/a") && p.depth==1) {
                    isTitle = false;
                }
                if (p.text.endsWith("href=")) {
                    cell.href = parts[pi_next].text;
                }
                if (p.text.endsWith("src=")) {
                    cell.src = parts[pi_next].text;
                }
            }
        }
        cell.plain_text = cleanWhiteSpace(cell.plain_text);
        cell.title = cleanWhiteSpace(cell.title);
        cell.subtitle = cleanWhiteSpace(cell.subtitle);
        
        cell = null;
    }
    console.log(JSON.stringify(cells,null,2));

    var rawJson = "[";
    for (var i in cells) {
        rawJson += JSON.stringify(cells[i]) + ",\n";
    }
    rawJson += "]";
    fs.writeFileSync("timeline.json",rawJson);

    return cells;
}

function categorizeCells() {
    var cells = JSON.parse( fs.readFileSync("timeline.json") );

    var category = "team";
    var knownCategories = {
        "PRODUCTS":"product",
        "PERSONAL PROJECTS":"personal",
        "ACTIVE INTERESTS and *articles":"interest",
    }
    for (var i in cells) {
        var cell = cells[i];
        if (cell.subtitle in knownCategories) {
            category = knownCategories[cell.subtitle];
        }
        cell.category = category;
    }

    var rawJson = "[";
    for (var i in cells) {
        rawJson += JSON.stringify(cells[i]) + ",\n";
    }
    rawJson += "]";
    fs.writeFileSync("timeline.json",rawJson);
}

function groupByCallback(ar,callback) {
    var ans = {};
    for (var i in ar) {
        var item = ar[i];
        var key = item ? callback(item) : "";
        if (key in ans) {
            ans[key].push(item);
        } else {
            ans[key] = [ item ];
        }
    }
    return ans;
}

function flattenGroups(groups) {
    var ans = [];
    for (var name in groups) {
        var g = groups[name];
        for (var i in g) {
            ans.push(g[i]);
        }
    }
    return ans;
}

function cleanUpString(str) {
    var replacements = {
        "video-article":"Articles - Videos",
        "article-images":"Articles - Images",
        "sculpture":"Sculpture & Literature",
        "undefined":"Links",
        "collage":"University Years",
        "article-theory":"Articles - Theory"
    };
    if (str === undefined) str = "undefined";
    if (str in replacements) {
        return replacements[str];
    }

    var parts = ("" + str).split("-");
    var ans = "";
    for (var i in parts) {
        if (i != 0) {
            ans += " - ";
        }
        var part = parts[i];
        ans += part.substr(0,1).toUpperCase() + part.substr(1);
    }
    return ans;
}

function updatePaintingCategories()
{
    console.log("Started updatePaintingCategories");
    var list = getPaintingsList();
    for (var li in list) {
        var item = list[li];
        var path = item.thumbnail;
        var hasPath = ((part) => {
            return path.includes(part);
        });

        if (hasPath("PAT_S_art")) {
            item.by = "pat";
        } else {
            item.by = "pete";
        }

        if (hasPath("Doors/")
            || hasPath("_doors")) {
            item.category = "door";
        } else if (hasPath("mural") || hasPath("3d2d")) {
            item.category = "mural";
        } else {
            item.category = "painting";
        }

        var pathParts = path.split("/");
        item.subgroup = pathParts[pathParts.length-2];
    }
    
    updatePaintingsList(list);
    console.log("Updated categories.");
}

function updateIndexPage() {
    var cells = getPaintingsList();
    var groups = groupByCallback(cells, (a) => (a.by + "_" + a.category));
    var lines = "";
    var groupOrder = [];
    for (var i in groups) {
        groupOrder.push(i);
    }
    groupOrder.reverse();

    var subgroup = undefined;
    var groupInfos = {
        "painting":{title:"Paintings",color:"black"},
        "mural":{title:"Murals",color:"#6898b3"},
        "door":{title:"Doors",color:"#68b368"}
    };
    var subgroupRenames = {
        "Flor_da" : "Florida",
        "A_pre_96" : "Pre-1996",
        "Old_art" : "Old Art",
        "A_pre_96" : "Pre-1996",
        "3d2d_bass_arcade" : "3D2D Murals",
        "3d2d_murals" : "3D2D Murals - Smaller",
        "Painted_Doors" : "Painted Doors",
        "Murals_doors" : "Murals Doors",
        "Cape" : "Cape Town",
        "Cape_two" : "Cape Town (cont.)",
        "PAT_S_art" : "Misc",
        "Pat" : "Pat&Pete Photos",
        "Pndc_oils_2" : "Portaits & Later Works",
    };

    for (var groupIndex in groupOrder)
    {
        var groupName = groupOrder[groupIndex];
        var artist = groupName.split("_")[0];
        var artType = groupName.split("_")[1];
        var info = groupInfos[artType];
        lines += "<div style='width:100%;background-color:" + info.color + "' >";
        var title = info.title;
        if (artist == "pat") {
            title += " by Patrick Cordingley ";
        }
        lines += "<h2 class='pcell_group_major'>\n" + title + "</h2>\n";
        lines += "<div><table><tr>\n";

        var cellList = groups[groupName];
        if (cellList[0].subgroup) {
            cellList = flattenGroups( groupByCallback(cellList, (c) => c.subgroup));
        }
        for (var i in cellList) {
            var cell = cellList[i];
            if (cell.subgroup != subgroup) {
                subgroup = cell.subgroup;
                lines += "\n</tr></table></div>\n";
                var subgroupTitle = cleanUpString(subgroup);
                if (subgroupTitle in subgroupRenames) {
                    subgroupTitle = subgroupRenames[subgroupTitle];
                }
                lines += "<h3 style='margin:0px; padding-top:20px; color:white;'><i>" + subgroupTitle + "</i></h3>";
                lines += "<div style='overflow-x:scroll;' >";
                lines += "<table style='width:min-content;' ><tr>\n";
                //lines += "<tr><td colspan='3'><i>" + subgroup + "</i></td></tr>\n";
                //lines += "<tr>\n";
            }
            var tdProps = " valign='top' ";
            if (cell.category == "team") {
                tdProps += " align='center' ";
            }
            var td = "\n<td class='pcell_td' " + tdProps + " >" + cellToHtml(cell) + "</td>\n";
            lines += td;
            
        }
        lines += "</tr></table></div>\n"
        lines += "</div>";
    }

    var tempPath = "webbuild/tmp_page.html"
    fs.writeFileSync(tempPath, lines);

    var wholeTemplate = "" + fs.readFileSync("webbuild/pete_bio_template.html");
    var wholeCore = "" + fs.readFileSync(tempPath);
    var replaceMarker = "<!--INSERT_PROFOLIO_HERE-->";
    var wholeFinal = wholeTemplate.replace(replaceMarker, wholeCore);
    var outFile = "index.html";
    fs.writeFileSync(outFile, wholeFinal);
    console.log("Generated '" + outFile + "'.");
}

//collectJsonFromFiles();
//generateThumbnailsFromJson();
//updatePaintingCategories();
updateIndexPage();



console.log("Done.");