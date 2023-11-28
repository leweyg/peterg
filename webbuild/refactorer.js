
console.log("Starting...");

const http = require('http'); // or 'https' for https:// URLs
const fs = require('fs');

function pathToLocalPath(path) {
    return "docs/" + path;
}

function pathToRemotePath(path) {
    return "http://lewcid.com/" + path;
}

function folderFromPath(path) {
    var end = path.lastIndexOf("/");
    if (end >= 0) {
        return path.substr(0,end+1);
    }
    return "";
}

function removeUpFolders(path) {
    while (path.includes("../")) {
        var center = path.indexOf("../");
        var left = path.substr(0,center-1);
        var right = path.substr(center+3);
        left = left.substr(0,left.lastIndexOf("/"));
        path = left + "/" + right;
    }
    return path;
}

function backToRoot(path) {
    var ans = "";
    while (path.includes("/")) {
        ans += "../";
        path = path.substr(path.indexOf("/")+1);
    }
    return ans;
}

function pathFromOriginal(linkPath,filePath) {
    if (linkPath.includes("?")) {
        linkPath = linkPath.substr(0,linkPath.indexOf("?"));
    }
    if (linkPath.includes("#")) {
        linkPath = linkPath.substr(0,linkPath.indexOf("#"));
    }
    var path = linkPath;
    var folder = folderFromPath(filePath);
    var toRoot = backToRoot(filePath);
    if (path.startsWith("http")) {
        path = path.substr(path.indexOf("com/")+4);
        if (path.startsWith(folder)) {
            path = path.substr(folder.length);
        } else {
            path = toRoot + path;
        }
    } else {
        // already a relative path
        path = path;
    }


    // now make it relative to the folder of filePath:
    return path;
}

function fileExists(path) {
    return fs.existsSync(path);
}

function fileReadWhole(path) {
    return fs.readFileSync(pathToLocalPath(path));
}

function fileContentsValid(content) {
    if (content.length == 0)
        return false;
    if (content.includes("404 - Not Found"))
        return false;
    if (content.includes("Invalid Request"))
        return false;
    return true;
}

function fileCheckWasValid(localPath) {
    if (fs.existsSync(localPath)) {
        var whole = "" + fs.readFileSync(localPath);
        if (!fileContentsValid(whole)) {
            console.log("Bad file, removing: " + localPath);
            fs.unlinkSync(localPath);
        }
    }
}

var _threadCounter_Global = 0;
function threadCounter(delta=1) {
    _threadCounter_Global += delta;
    console.log("Threads:" + _threadCounter_Global + " (+" + delta + ")" );
}
function threadStart() {
    threadCounter(1);
}
function threadDone() {
    threadCounter(-1);
}

function downloadFile(path, callback) {
    if ((path=="") || (path.endsWith("/"))) {
        return; // folders
    }

    var localPath = pathToLocalPath(path);
    var remotePath = removeUpFolders(pathToRemotePath(path));
    if (fileExists(localPath)) {
        return;
    }
    console.log("Downloading '" + remotePath + "' into '" + localPath + "'...");
    //return;

    threadStart();
    var folderPath = folderFromPath(localPath);
    if (!fs.existsSync(folderPath)){
        fs.mkdirSync(folderPath, { recursive: true });
    }
    const file = fs.createWriteStream(localPath);
    const request = http.get(remotePath, function(response) {
       response.pipe(file);
    
       // after download completed close filestream
       file.on("finish", () => {
           file.close();
           fileCheckWasValid(localPath);
           console.log("Download Completed");
           threadDone();
       });
    });
}

//downloadFile("index.html");

function isStringALink(str) {
    str = str.toLowerCase();
    if (str.startsWith("http")) return true;
    if (str.endsWith(".png")) return true;
    if (str.endsWith(".jpg")) return true;
    if (str.endsWith(".pdf")) return true;
    if (str.endsWith(".jpeg")) return true;
    if (str.endsWith(".html")) return true;
    if (str.endsWith("/")) return true;
    return false;
}

function isNextALink(str) {
    str = str.toLowerCase();
    if (str.endsWith("href=")) return true;
    if (str.endsWith("src=")) return true;
    return false;
}

function isDropLink(str) {
    if (str.startsWith("#")) return true;
    if (str.startsWith("javascript:")) return true;
    if (str.startsWith("mailto:")) return true;
    if (str.startsWith("http") && !str.includes("lewcid")) return true;
    if (str.endsWith(".com")) return true;
    return false;
}

function findLinksInFile(path,full_list=null) {
    var text = "" + fileReadWhole(path);
    var parts = text.split("\"");
    var ans = [];
    var nextIsLink = false;
    for (var p in parts) {
        var str = parts[p];
        var isLink = (nextIsLink || isStringALink(str)) && (!isDropLink(str));
        if (isLink)
        {
            ans.push(str);
        }
        if (full_list) {
            full_list.push({text:str,is_link:isLink});
        }
        nextIsLink = isNextALink(str);
    }
    return ans;
}

function showLinks(path) {
    var links = findLinksInFile(path);
    console.log("Link Count = " + links.length);
    for (var i in links) {
        var to = pathFromOriginal(links[i], path);
        console.log("to='" + to + "' Link='" + links[i] + "' ");
    }
}

function checkRelativeFileDownloaded(link,owningFilePath) {
    if (link.startsWith("http")) return; // external link, check?

    var folder = folderFromPath(owningFilePath);
    var path = folder + link;
    //console.log(path);
    downloadFile(path);
}

function checkAndOrRefactorFile(path, reallyRefactor=false) {
    // todo
    var fullText = [];
    findLinksInFile(path, fullText);
    var localPath = pathToLocalPath(path);
    var fout = null; //fs.createWriteStream(localPath);
    if (reallyRefactor && fileExists(localPath)) {
        console.log("Refactoring '" + localPath + "'...");
        fout = fs.createWriteStream(localPath);
    }
    
    // loop over full text and write it out etc.
    var isFirst = true;
    for (var ndx in fullText) {
        if (!isFirst) {
            if (fout) fout.write("\"");
        }
        isFirst = false;
        var ln = fullText[ndx];
        if (!ln.is_link) {
            if (fout) fout.write(ln.text);
        } else {
            var postfix = "";
            if (ln.text.includes("?")) {
                var cutPos = ln.text.indexOf("?");
                postfix = ln.text.substr(cutPos);
                ln.text = ln.text.substr(0,cutPos);
            } else if (ln.text.includes("#")) {
                var cutPos = ln.text.indexOf("#");
                postfix = ln.text.substr(cutPos);
                ln.text = ln.text.substr(0,cutPos);
            }
            var to = pathFromOriginal(ln.text, path);
            if (fout) fout.write(to);
            if (fout && postfix) fout.write(postfix);

            // check that relative path exists:
            checkRelativeFileDownloaded(to, path);
        }
    }
    if (fout) fout.close();
}

function findAllFiles(path="lg/") {
    var infos = fs.readdirSync(pathToLocalPath(path), { withFileTypes: true });
    var ans = [];
    for (var i in infos) {
        var prefix = (path=="") ? "" :
                    ((path.endsWith("/") ? path : (path + "/")));
        var prefixed = prefix + infos[i].name;
        if (!infos[i].isDirectory()) {
            var str = prefixed;
            ans.push(str);
        } else {
            var sub = findAllFiles(prefixed);
            for (var j in sub) { ans.push(sub[j]); }
        }
        //console.log(infos[i].name + " " + ( infos[i].isDirectory() ? "/" : "" ) );
    }
    return ans;
}

function findAllHtmlFiles() {
    var files = findAllFiles();
    var ans = [];
    for (var i in files) {
        var path = files[i];
        if (path.endsWith(".html")) {
            ans.push(path);
        }
    }
    return ans;
}

function downloadAll()
{
    var htmls = findAllHtmlFiles();
    for (var i in htmls) {
        var path = htmls[i];
        console.log(path);
        checkAndOrRefactorFile(path, false);
    }
}
//downloadAll();
//downloadFile("lg/lc/win32/index.html");

function redownloadHtmls()
{
    var htmls = findAllHtmlFiles();
    for (var i in htmls) {
        var path = htmls[i];
        //console.log(path);
        var localPath = pathToLocalPath(path);
        fs.unlinkSync(localPath);
        downloadFile(path);
    }
}
//redownloadHtmls();

//checkAndOrRefactorFile("index.html", true);
//checkAndOrRefactorFile("lg/index.html", true);
//checkAndOrRefactorFile("lg/aboutme.html", true);
function refactorAll()
{
    var htmls = findAllHtmlFiles();
    for (var i in htmls) {
        var path = htmls[i];
        console.log(path);
        checkAndOrRefactorFile(path, true);
    }
}
//refactorAll();

console.log("Wrapping...");

function checkThreads() {
    if (_threadCounter_Global > 0) {
        console.log("Waiting for threads...!");
        setTimeout(() => checkThreads(), 5000);
    } else {
        console.log("Done.");
    }
}

checkThreads();



