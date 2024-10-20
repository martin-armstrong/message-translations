// ==UserScript==
// @name         MessageTranslations
// @namespace    http://hmrc.gov.uk
// @version      2.0
// @description  Dashboard showing all english/welsh messages found in play framework repos owned by your team and where any gaps are.
// @author       Martin Armstrong
// @match        https://github.com/orgs/*/teams/*
// @grant        none
// @updateURL     https://github.com/martin-armstrong/message-translations/raw/main/MessageTranslations.user.js
// @downloadURL   https://github.com/martin-armstrong/message-translations/raw/main/MessageTranslations.user.js
//
//
// ==/UserScript==
// 2.0 - 20/10/2024 - GitHub html/json compatibility updates. Add message count totals, file links and CSS tweaks.
//
// Earlier versions no longer compatible with GitHub...
// 1.2 - updates to match GitHub html/json changes.
// 1.1 - Adds option to export known welsh translations to CSV file.

const teamServiceMessages = (function(){

const appName = "message-translations";
const parentClass = "message-translations";

var orgName = ""
var teamName = "";
const repoExclusions = [
  /app-config-.+/,
  /.+test/,
  /.+tests/,
  /.+specs/,
  /.+testing/,
  /.+-config/,
  /build-jobs/,
  /domain/,
//  /.+stub/,
  /.+perf/,
  /.+-dashboards/,
  /.+-jobs/,
  /mdtp-frontend-routes/,
  /play-auth/,
  /play-authorisation/,
  /play-authorised-frontend/,
  /play-filters/,
  /saml/,
  /scripts/,
  /tax-year/,
  /play-sso/,
  /outage-pages/,
  /sbt-service-manager/
];

/*
has entries of the form..
repoName:{
 status:{label:"All Welsh present", number:0, colour:"#c8ffb8"},
 en:{fileName:"messages.en", count:87},
 cy:{fileName:"messages.cy", count:87},
 messages:[{key:"some.key", english:"some english message", welsh:""}]
}
*/
var repoData = {}

//load props from json in url property matching appName
var props = (function(){
  var index = location.href.indexOf(appName);
  if(index>-1) {
    var jsonString = location.href.substring(index+appName.length+1);
      return jsonString.length>0 ? JSON.parse(decodeURIComponent(location.href.substring(index+appName.length+1))) : {};
  } else {
      return {};
  }
})();

var repoNames = [];
var processedRepos = 0;
var parsedMessagesFiles = 0;

const DOM_ID = {
  CONTAINER: appName+"-container",
  CONTENT: appName+"-content",
  HEADER: appName+"-header",
  REFRESH_BUTTON: appName+"-refresh"
}

//reload the page adding url parameter containing json of the props you want to render the page with
function reloadWithProps(props) {
  var index = location.href.indexOf('?') || location.href.length;
  location.assign(location.href.substring(0, index) + "?"+appName+"="+JSON.stringify(props));
}

function setOrgAndTeamFromLocation() {
  var matches = window.location.href.match(new RegExp("https://github.com/orgs/([^/]+)/teams/([^/]+)")) || ["","",""];
  orgName = matches[1];
  teamName = matches[2];
  console.log("Setting orgName:"+orgName+", teamName:"+teamName);
}

//page through the repositories list, parsing and extracting repo names as we go
function findReposForTeam(org, team, nextPageUrl, callback){ //https://github.com/orgs/hmrc/teams/gg/repositories
  const url = nextPageUrl || "https://github.com/orgs/"+orgName+"/teams/"+team+"/repositories";
  setHeaderText(" Loading "+url);
  fetch(url, {credentials: "same-origin"})
    .then(response => response.text())
    .then(responseText => {
      setHeaderText(" Parsing "+url);
      var repoNames = responseText.match(new RegExp('data-bulk-actions-id="([^"]+)"',"gmi")) || [];
      var nextLink = responseText.match(new RegExp('href="([^"]+)">Next<',"gmi")) || [];
      repoNames = repoNames.map(htmlAtt=>htmlAtt.substring('data-bulk-actions-id="'.length, htmlAtt.length-1));
      repoNames = repoNames.sort();
      if(nextLink.length>0 && nextLink[0].length>13) {
          nextLink = nextLink[0].substring(6, nextLink[0].length-7);
          findReposForTeam(org, team, nextLink, function(moreRepoNames){
            repoNames = [].concat(repoNames).concat(moreRepoNames);
            repoNames = repoNames.sort();
            repoNames.forEach(repoName=>console.log("Found repoName: "+repoName));
            if(typeof callback=="function") callback(repoNames);
          })
      }
      else {
         repoNames.forEach(repoName=>console.log("Found repoName: "+repoName));
         if(typeof callback=="function") callback(repoNames);
      }
    });
}

//adds a 'Message Translations' tab in your github team view
function addTabLink(orgName, teamName) {
  const div = document.createElement("div");
  div.className = "Button";

  const a = document.createElement("a");
  if(location.href.indexOf(appName)>-1) {
    a.className="Button Button--iconOnly Button--secondary Button--medium AppHeader-button color-fg-muted";
  }
  else {
    a.className="Button Button--iconOnly Button--secondary Button--medium AppHeader-button color-fg-muted";
  }
  a.id = appName+"-link";
  a.innerHTML = 'Message Translations';
  a.style.cursor = "pointer";
    a.style.padding = "0px 4px 0px 4px";
  a.href="#";
  a.addEventListener("click", actionHandler);

  div.append(a);
  document.querySelector("div.AppHeader-actions").append(a);
}

function Status(label, number, colour) {
  this.label = label;
  this.number=number;
  this.colour=colour;
}

const STATUS = {
  NO_MESSAGES:new Status("No messages", 0, "#edfbe8"),
  OK:new Status("All Welsh present", 1, "#c8ffb8"),
  WELSH_GAPS:new Status("Some Welsh missing", 2, "#F3F7A1"),
  NO_WELSH:new Status("No Welsh found", 3, "#f9c1af")
}



function renderHeaderDiv(parentNode) {
  const div = document.createElement("div");
  div.className="table-list-header table-list-header-next bulk-actions-header my-header";
  var html = '<div class="table-list-filters d-flex">';
    html += '<span class="table-list-heading table-list-header-meta flex-auto">';

    html += ' <span id="'+DOM_ID.HEADER+'">## pull requests for team repos</span>';

    html += '<div id="key">Key: ';
    html += '<span class="key-cell" style="background-color:'+STATUS.NO_MESSAGES.colour+';">'+STATUS.NO_MESSAGES.label+'</span>';
    html += '<span class="key-cell" style="background-color:'+STATUS.OK.colour+';">'+STATUS.OK.label+'</span>';
    html += '<span class="key-cell" style="background-color:'+STATUS.WELSH_GAPS.colour+';">'+STATUS.WELSH_GAPS.label+'</span>';
    html += '<span class="key-cell" style="background-color:'+STATUS.NO_WELSH.colour+';">'+STATUS.NO_WELSH.label+'</span>';
    html += '</div>';


    html += "<div class=\"pull-right\">"
    html += "<a class=\"export-as-csv link-hover\" id=\"export-as-csv\" href=\"#\">CSV Export</a>"
    html += '<div id=\"expand-all\" class=\"link-hover\">Expand All</div>';
    html += '<div id=\"collapse-all\" class=\"link-hover\">Collapse All</div>';
    html += '<img id="'+DOM_ID.REFRESH_BUTTON+'" title="Reload" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGmSURBVFhH7ZY5SgRBFEDHTBFz9wVF8SyCgSIiegEXNFE8iomRgeIaiMtNXHKNXUHcfa+ZgmZAe7GhQefBY6iiquvXdHX9X6lTJyOduICneI6P+ITX1b4V7MbCacd1fMXPBB2zgR1YCKP4gD78GbdxCoewGRuxFydwEx3j2Fscx0AIMBNL+I5O3MMBTKILd9A5HziPkjkAd+7ib+i7zcoiOtcgxjBTAL6/e3RCnsUDc+gzbqq/qQPwwDl4P2r9jgMMi6cKwHfoX+dh6rcjB/EFa03E79yBnva81C4aN5FjdKCfWilcogEMRq0SCKe/JWr9EdyMm3JzpeC1bQAXUasEZtAAjqJWAg78zrzsovNno1YCtYvGzYMJ7AVN06b1ROIL/vYqbsBD9FlrdqQhLB4SiAklL6voM6wNWu1IQwjAFGoqNS9YF2TBnbt4SOcjmJoQgFhMGIRtX0cPJuE7D3+7i5tbMhEPQCyr7tA+M+QWTmIfNqGXzDBOo6c9lGTOybTzn7BAsdBMW5R64NqwcKwVlvEEr9CS3Ov1DL1k/M4Lq4br/AcqlS/NoqKCkW1vxQAAAABJRU5ErkJggg=="> ';
    html += "</div></br>"


    html += '<div class=\"message-header\">';
    html += '<div class="message-key">Repo / Key</div><div class="message-english">English</div><div class="message-welsh">Welsh</div>';
    html += '</div>';
    html += '</span>';
    html += '</div>';
   div.innerHTML = html;
   parentNode.appendChild(div);
    //document.getelementById('export-as-csv').onclick = actionHandler;
}

function setHeaderText(text) {
  document.getElementById(DOM_ID.HEADER).innerText = text;
}

function renderStyleTag(parentNode) {
  const style = document.createElement("style");
  var styleText = `
     .repo-popup {
        box-shadow: 5px 5px 20px 0px;
        z-index:100;
        position:fixed;
        left:40%;
        top:30%;
        padding:10px 20px 20px 20px;
        background-color:white;
        border:1px grey solid;
        font-size:16px
     }
     .repo-popup-close {color:red; margin-left:10px; cursor:pointer}
     .repo-popup-heading {font-weight:bold;  display:inline-block; min-width:200px; margin-bottom:10px}
     .key-cell {padding:0px 3px 0px 3px;}
     .repo {font-weight:bold; border-top:2px solid black; padding-left:5px;}
     .my-header {height:85px;}
     .repo-messages {font-weight:normal;}
     .repo-message {width:100%; border-top:1px solid grey;}
     .message-header {font-weight:bold; width:100%; float:left;}
     .message-key {display:inline-block; width:25%; vertical-align:top; padding-left:5px;}
     .message-english {display:inline-block; width:37%; vertical-align:top; padding-left:5px;}
     .message-welsh {display:inline-block; width:37%; vertical-align:top; padding-left:5px;}
     .toggle {}
     .link-hover:hover {cursor:pointer; color:blue;}
     #key {margin-left:15px; margin-right:10px; float:right;}

     .pull-right {display:inline-block;vertical-align:top;float:right;}
     .export-as-csv {display:hidden; color:inherit; margin-right:20px; vertical-align:top; text-decoration:underline;}
     #${DOM_ID.REFRESH_BUTTON} {width:20px;position:relative;cursor:pointer;margin:0px 10px 0px 5px;}
     #expand-all {display:inline-block; margin-right:20px; vertical-align:top; text-decoration:underline;}
     #collapse-all {display:inline-block; margin-right:20px; vertical-align:top; text-decoration:underline;}
  `;

  style.innerText = styleText;
  parentNode.appendChild(style);
}

function renderContentDiv(parentNode){
  const div = document.createElement("div");
  div.id = DOM_ID.CONTENT;
  parentNode.appendChild(div);
}


function refreshHandler() {
  reloadWithProps(props);
}

function renderContainer() {
  const existingContainer = document.getElementById(DOM_ID.CONTAINER)
  if(existingContainer) {
      existingContainer.parentNode.removeChild(existingContainer);
  }
  const div = document.createElement("div");
  div.className="js-check-all-container js-bulk-actions-container";
  div.id=DOM_ID.CONTAINER;
  renderStyleTag(div);
  renderHeaderDiv(div);
  renderContentDiv(div);
  div.onclick = actionHandler;
  document.querySelector(".container").style.width="90%";
  document.querySelector(".container").appendChild(div);
  document.getElementById(DOM_ID.REFRESH_BUTTON).onclick = refreshHandler
}

function render() {
    //clear any existing rows
    const contentDiv = document.getElementById(DOM_ID.CONTENT);
    contentDiv.innerHTML = "";

    document.getElementById('export-as-csv').style.display = "inline-block";

    eachRepo((repoName, data)=>{
        renderRepo(contentDiv, data);
        hideRepoMessages(repoName); //collapse messages view initially
    });
}

function eachRepo(fn) {
    repoNames.forEach((repoName)=>{
        if(repoData.hasOwnProperty(repoName)){
          fn(repoName, repoData[repoName]);
        }
    });
}



function toggleRepoMessages(repoName) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      if(repoMessagesDiv.style.display=="none") {
        repoMessagesDiv.style.display="block";
        toggleSpan.innerHTML = "[-]";
        toggleSpan.title = "Collapse";
      } else {
        repoMessagesDiv.style.display="none";
        toggleSpan.innerHTML = "[+]";
        toggleSpan.title = "Expand";
      }
}

function hideRepoMessages(repoName) {
    if(Object.entries(repoData[repoName].messages).length>0) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      repoMessagesDiv.style.display="none";
      toggleSpan.innerHTML = "[+]";
      toggleSpan.title = "Expand";
    }
}

function showRepoMessages(repoName) {
    if(Object.entries(repoData[repoName].messages).length>0) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      repoMessagesDiv.style.display="block";
      toggleSpan.innerHTML = "[-]";
      toggleSpan.title = "Collapse";
    }
}


function csvField(str) {
  return '"' + str.replace(/\"/g, '""') + '"';
}

function exportAsCSVClickHandler(evt) {
  const targetLink = evt.target;

  const consolidatedMessages = {};
  for(var [repoName, data] of Object.entries(repoData)) {
    for(var [k, newMessage] of Object.entries(data.messages)) {
      const current = consolidatedMessages["QQ"+newMessage.english] || {count:0, key:"", english:"", welsh:""};
      consolidatedMessages["QQ"+newMessage.english] = {
          count : current.count+1,
          key : newMessage.key,
          english : newMessage.english,
          welsh : newMessage.welsh || current.welsh
      };
    }
  }

  const sortedMessagesWithWelsh = Object.entries(consolidatedMessages).map(
      (entry)=>{return entry[1]}
  ).filter(
      (message)=>{return message.welsh.length>0}
  ).sort(
      (a,b)=>{return a.english.localeCompare(b.english)}
  );


  const csvLines = sortedMessagesWithWelsh.map(message=> {
    return `${message.key},${message.count},${csvField(message.english)},${csvField(message.welsh)}`;
  });

  csvLines.unshift("Key,Count,English,Welsh");

  const csv = csvLines.join("\n");
  const blob = new Blob([csv], {type : 'text/csv'});
  var objectUrl = window.webkitURL.createObjectURL(blob);
  var filename = 'MessageTranslations.csv';

  targetLink.download = filename;
  targetLink.href = objectUrl;

  //now let the default anchor behaviour do its thing and navigate to our csv content
}


function actionHandler(evt) {
    evt.stopPropagation();
    const el = evt.target;
    if(el.className.includes("toggle")) {
      const repoName = el.dataset.repoName;
      toggleRepoMessages(repoName);
    }
    else if(el.id=="expand-all") {
        eachRepo((repoName, data)=>{
          showRepoMessages(repoName);
        });
    }
    else if(el.id=="collapse-all") {
        eachRepo((repoName, data)=>{
          hideRepoMessages(repoName);
        });
    }
    else if(el.id=="export-as-csv") {
        exportAsCSVClickHandler(evt);
    }
    else if(el.id==appName+"-link") {
        window.location.assign("/orgs/"+orgName+"/teams/"+teamName+"/repositories?"+appName);
        evt.preventDefault();
    }
    else {
        return true;
    }
}



function renderRepo(parentElement, data) {
  const repoDiv = document.createElement("div");
  repoDiv.id = "repo-"+data.repoName;
  repoDiv.className = "repo";
  repoDiv.style.backgroundColor = data.status.colour;
  var innerHTML = `${data.repoName} - en:${data.en.count} cy:${data.cy.count}`;
  if(Object.entries(data.messages).length>0) {
      innerHTML += " : <span id=\"toggle-"+data.repoName+"\" data-repo-name=\""+data.repoName+"\" class=\"toggle link-hover\">[-]</span>";
  }
  innerHTML += "<br/><div id=\"repo-messages-"+data.repoName+"\" class=\"repo-messages\"></div>";
  repoDiv.innerHTML = innerHTML;
  parentElement.appendChild(repoDiv);

  if(data.en.fileName || data.cy.fileName) {
    renderRepoMessagesfileLinks(data.repoName, data.en.fileName, data.cy.fileName);
  }

  for(var [key, message] of Object.entries(data.messages)) {
    if(message!=null && message.key) {
      renderRepoMessage(data.repoName, message);
    }
  }
}


function Message(key, english, welsh){
  this.key = key;
  this.english = english;
  this.welsh = welsh;
}



function renderRepoMessagesfileLinks(repoName, englishFile, welshFile) {
    const parentDiv = document.getElementById("repo-messages-"+repoName);
    const div = document.createElement("div");
    const divId = "repo-message-"+repoName+"-links";
    const divEnglishId = divId + "-english";
    const divWelshId = divId + "-welsh";
    div.id = divId;
    div.className = "repo-message";
    //div.style.backgroundColor = "white";
    var innerHTML = "<div class=\"message-key\"></div>";
    const englishFileURL = urlForMessagesFile(repoName, englishFile);
    const welshFileURL = urlForMessagesFile(repoName, welshFile);
    const englishFileAnchor = englishFile ? `<a href="${englishFileURL}" target="_blank">Engish Messages File</a>` : "";
    const welshFileAnchor = englishFile ? `<a href="${welshFileURL}" target="_blank">Welsh Messages File</a>` : "";
    innerHTML += `<div id="${divEnglishId}" class="message-english">${englishFileAnchor}</div>`;
    innerHTML += `<div id="${divWelshId}" class="message-welsh">${welshFileAnchor}</div>`;
    div.innerHTML = innerHTML;
    parentDiv.appendChild(div);
}

function renderRepoMessage(repoName, message) {
    const parentDiv = document.getElementById("repo-messages-"+repoName);
    const div = document.createElement("div");
    const divId = "repo-message-"+repoName+"-"+message.key;
    const divEnglishId = divId + "-english";
    const divWelshId = divId + "-welsh";
    div.id = divId;
    div.className = "repo-message";
    div.style.backgroundColor = "white";
    if(!message.welsh) {
      div.style.backgroundColor = STATUS.NO_WELSH.colour;
    }
    var innerHTML = "<div class=\"message-key\">"+message.key+"</div>";
    innerHTML += "<div id=\""+divEnglishId+"\" class=\"message-english\"></div>";
    innerHTML += "<div id=\""+divWelshId+"\" class=\"message-welsh\"></div>";
    div.innerHTML = innerHTML;
    parentDiv.appendChild(div);
    document.getElementById(divEnglishId).textContent = message.english;
    document.getElementById(divWelshId).textContent = message.welsh;
}


function filteredRepoNames(repoNames) {
  return repoNames.filter((name)=>{
      return repoExclusions.filter((exlusion)=>{
        return exlusion.test(name)
      }).length == 0; //no exclusion regexes should match the repo name
  });
}

function init(){
  setOrgAndTeamFromLocation();
  addTabLink(orgName, teamName);
  console.log(`location currently: ${location.href}`);
  if(location.href.indexOf(appName)>-1) {
    //unselect 'Repositories' nav link
    document.querySelector("a#repositories-tab").className="UnderlineNav-item no-wrap js-responsive-underlinenav-item js-selected-navigation-item";

    //hide repositories content
    document.querySelector("div.js-check-all-container").style.display="none";

    renderContainer();

    setHeaderText(" Loading..");

    findReposForTeam(orgName, teamName, null, function(allRepoNames){
      repoNames = filteredRepoNames(allRepoNames).sort();
      processedRepos = 0;
      setHeaderText(" Found "+repoNames.length+" team repositories. Finding messages files..");
      loadMessagesFromRepos(repoNames);
    });
  }
}


    function loadMessagesFromRepos(repoNames) {
      repoNames.forEach((repoName)=>{
        loadMessagesForRepo(repoName).then((data)=>{
          if(data != {} && data.messages!={}) {
            repoData[repoName] = data;
          }
          if(processedRepos==repoNames.length) {
            setHeaderText("Parsed "+parsedMessagesFiles+" messages files from "+processedRepos+"/"+repoNames.length+" repositories. DONE");
            render();
          }
        });
      });
    }

      //returns a promise for messages repo data object
      //which looks like {repoName: "", status:STATUS.OK, messages:{key: {english:"", welsh:""}...}}
    function loadMessagesForRepo(repoName) {
      return parseEnglishMessagesFile(repoName).then((englishResult)=>{
            const data = {
                  repoName: repoName,
                  status:STATUS.OK,
                  en:{
                    count:Object.entries(englishResult.messages).length,
                    fileName:englishResult.fileName
                  },
                  cy:{
                    count:0,
                    fileName:""
                  },
                  messages:{}
              };
            if(Object.entries(englishResult.messages).length>0) {
                parsedMessagesFiles++;
            }
            for (const [key, value] of Object.entries(englishResult.messages)) {
              data.messages[key] = {key:key, english:value, welsh:""};
            }
            return data;
          })
          .then((data)=>{
            return parseWelshMessagesFile(repoName).then((welshResult)=>{
              data.cy.count = Object.entries(welshResult.messages).length;
              data.cy.fileName = welshResult.fileName;
              console.info(`Found ${data.en.count} English and ${data.cy.count} Welsh messages for ${repoName}..`);
              if(data.en.count==0) {
                data.status = STATUS.NO_MESSAGES;
              }
              else if(data.cy.count==0) {
                data.status = STATUS.NO_WELSH;
              }
              else {
                 parsedMessagesFiles++;
                for (const [key, obj] of Object.entries(data.messages)) {
                  if(welshResult.messages.hasOwnProperty(key)) {
                    data.messages[key].welsh = welshResult.messages[key];
                  }
                  else {
                    data.messages[key].welsh = "";
                    data.status = STATUS.WELSH_GAPS;
                  }
                }
              }
              processedRepos++;
              setHeaderText(`Parsed ${parsedMessagesFiles} messages files from ${processedRepos}/${repoNames.length} repositories.`);
              return data;
            });
          })
    }


   //returns a promise for an array of Message objects parsed from english messages file
    function parseEnglishMessagesFile(repoName) {
      return parseMessagesFile(repoName, "messages")
          .catch((error)=>{
            return parseMessagesFile(repoName, "messages.en");
          })
          .catch((error)=>{
            return {fileName:"", messages:{}};
          });
    }

      //returns a promise for an array of Message objects parsed from welsh messages file
    function parseWelshMessagesFile(repoName) {
      return parseMessagesFile(repoName, "messages.cy").catch((error) => {return {fileName:"", messages:{}}});
    }


    //returns a promise for {fileName:fileName, messags:messages} where a messages object is parsed from a messages file
    // and is of the form {key1: "messageText1", key2: "messageText2"}
    function parseMessagesFile(repoName, fileName) {
      return loadFileLinesFromConfFolder(repoName, fileName)
            .then((lines)=>{
              const messages = {};
              try {
                  const cleanedLines = lines.filter((line)=>(typeof line == "string"))
                    .map((line)=>line.trim())
                    .filter((line)=>!line.startsWith("#"));
                  cleanedLines.map((line)=>{
                    const firstEqualsCharPos = line.indexOf('=');
                    if(firstEqualsCharPos) {
                        const key = line.substring(0,firstEqualsCharPos);
                        let value = "";
                        try {
                            value = line.substring(firstEqualsCharPos+1);
                        } catch(e) {
                            console.warn(`ignoring line ending with '=' : "${line}"`);
                        }
                        messages[key.trim()] = value.trim();
                    }
                  })
                  console.debug("Found "+Object.entries(messages).length+" messages in "+fileName+" for "+repoName+"..");
                  return {fileName:fileName, messages:messages};
              } catch(e) {
                console.error("Failed to parse "+fileName+" file from "+repoName);
                console.error(e);
                return {fileName:fileName, messages:messages};
              }
            });
    }


    function loadFileLinesFromConfFolder(repoName, fileName) {
      return parseTextFileLinesFromGitHub(urlForMessagesFile(repoName, fileName));
    }

    function urlForMessagesFile(repoName, fileName) {
      return `https://github.com/hmrc/${repoName}/raw/refs/heads/main/conf/${fileName}`
    }


    //parses text from given github source page url, returns promise for subscribing to asynch page parsing response
    function parseTextFileLinesFromGitHub(sourcePageUrl, debug) {
        return fetch(sourcePageUrl, {redirect: "follow"})
        .then(response => response.ok ? response.text() : Promise.reject(`Error - status:${response.status}`) )
        .then(responseText => {
            var rows = responseText.split("\n").filter((line)=>!line.startsWith("#") && !line.startsWith("<"));
            return rows;
        })
    }



init();

return {
  props:props,
  actionHandler:actionHandler
};

})();

window.teamServiceMessages = teamServiceMessages;



