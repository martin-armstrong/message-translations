// ==UserScript==
// @name         MessageTranslations
// @namespace    http://hmrc.gov.uk
// @version      1.0
// @description  Dashboard showing all english/welsh messages found in play framework repos owned by your team and where any gaps are.
// @author       Martin Armstrong
// @match        https://github.com/orgs/*/teams/*
// @grant        none
// @updateURL     https://github.com/martin-armstrong/message-translations/raw/main/MessageTranslations.user.js
// @downloadURL   https://github.com/martin-armstrong/message-translations/raw/main/MessageTranslations.user.js
//
//
// ==/UserScript==

var teamServiceMessages = (function(){

var appName = "message-translations";
var parentClass = "message-translations";

var orgName = ""
var teamName = "";
var repoExclusions = [
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
      if(nextLink.length>0 && nextLink[0].length>13) {
          nextLink = nextLink[0].substring(6, nextLink[0].length-7);
          findReposForTeam(org, team, nextLink, function(moreRepoNames){
            repoNames = [].concat(repoNames).concat(moreRepoNames);
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
  const a = document.createElement("a");
  if(location.href.indexOf(appName)>-1) {
    a.className="UnderlineNav-item no-wrap selected";
  }
  else {
    a.className="UnderlineNav-item no-wrap";
  }
  a.id = appName+"-link";
  a.innerHTML = 'Message Translations';
  a.style.cursor = "pointer";
  a.href="/orgs/"+orgName+"/teams/"+teamName+"/repositories?"+appName
  document.querySelector("nav.UnderlineNav-body[role='navigation']").append(a);
}

function Status(label, number, colour) {
  this.label = label;
  this.number=number;
  this.colour=colour;
}

var STATUS = {
  NO_MESSAGES:new Status("No messages", 0, "#edfbe8"),
  OK:new Status("All Welsh present", 0, "#c8ffb8"),
  WELSH_GAPS:new Status("Some Welsh missing", 1, "#F3F7A1"),
  NO_WELSH:new Status("No Welsh found", 2, "#f9c1af")
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

    html += '<img id="'+DOM_ID.REFRESH_BUTTON+'" title="Reload" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGmSURBVFhH7ZY5SgRBFEDHTBFz9wVF8SyCgSIiegEXNFE8iomRgeIaiMtNXHKNXUHcfa+ZgmZAe7GhQefBY6iiquvXdHX9X6lTJyOduICneI6P+ITX1b4V7MbCacd1fMXPBB2zgR1YCKP4gD78GbdxCoewGRuxFydwEx3j2Fscx0AIMBNL+I5O3MMBTKILd9A5HziPkjkAd+7ib+i7zcoiOtcgxjBTAL6/e3RCnsUDc+gzbqq/qQPwwDl4P2r9jgMMi6cKwHfoX+dh6rcjB/EFa03E79yBnva81C4aN5FjdKCfWilcogEMRq0SCKe/JWr9EdyMm3JzpeC1bQAXUasEZtAAjqJWAg78zrzsovNno1YCtYvGzYMJ7AVN06b1ROIL/vYqbsBD9FlrdqQhLB4SiAklL6voM6wNWu1IQwjAFGoqNS9YF2TBnbt4SOcjmJoQgFhMGIRtX0cPJuE7D3+7i5tbMhEPQCyr7tA+M+QWTmIfNqGXzDBOo6c9lGTOybTzn7BAsdBMW5R64NqwcKwVlvEEr9CS3Ov1DL1k/M4Lq4br/AcqlS/NoqKCkW1vxQAAAABJRU5ErkJggg=="> ';

    html += '<div id=\"expand-all\" class=\"link-hover\">Expand All</div><div id=\"collapse-all\" class=\"link-hover\">Collapse All</div>';

    html += '<div><div class="message-key message-header">Repo / Key</div><div class="message-english message-header">English</div><div class="message-welsh message-header">Welsh</div></div>';
    html += '</div>';
    html += '</span>';
    html += '</div>';
   div.innerHTML = html;
   parentNode.appendChild(div);
}

function setHeaderText(text) {
  document.getElementById(DOM_ID.HEADER).innerText = text;
}

function renderStyleTag(parentNode) {
  const style = document.createElement("style");
  var styleText = ".repo-popup {box-shadow: 5px 5px 20px 0px;z-index:100; position:fixed; left:40%; top:30%; padding:10px 20px 20px 20px; background-color:white; border:1px grey solid; font-size:16px}";
    styleText += ".repo-popup-close {color:red; margin-left:10px; cursor:pointer}";
    styleText += ".repo-popup-heading {font-weight:bold;  display:inline-block; min-width:200px; margin-bottom:10px}";
    styleText += ".key-cell {padding:0px 3px 0px 3px;}";
    styleText += ".repo {font-weight:bold; border-top:2px solid black; padding-left:5px;}";
    styleText += ".my-header {height:60px;}";
    styleText += ".repo-messages {font-weight:normal;}";
    styleText += ".repo-message {width:100%; border-top:1px solid grey;}";
    styleText += ".message-header {font-weight:bold;}";
    styleText += ".message-key {display:inline-block; width:25%; vertical-align:top; padding-left:5px;}";
    styleText += ".message-english {display:inline-block; width:37%; vertical-align:top; padding-left:5px;}";
    styleText += ".message-welsh {display:inline-block; width:37%; vertical-align:top; padding-left:5px;}";
    styleText += ".toggle {}";
    styleText += ".link-hover:hover {cursor:pointer; color:blue;}";
    styleText += "#key {margin-left:15px; margin-right:10px; float:right;}";

    styleText += "#"+DOM_ID.REFRESH_BUTTON+" {float:right;width:20px;position:relative;cursor:pointer;margin:0px 10px 0px 5px;}";
    styleText += "#expand-all {display:inline-block; margin-right:20px; float:right; text-decoration:underline;}";
    styleText += "#collapse-all {display:inline-block; margin-right:20px; float:right; text-decoration:underline;}";

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

    eachRepo((repoName, data)=>{
        renderRepo(contentDiv, data);
    });
}

function eachRepo(fn) {
    for(var repoName in repoData) {
      if(!repoData.hasOwnProperty(repoName)) {continue;}
      fn(repoName, repoData[repoName]);
    }
}



function toggleRepoMessages(repoName) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      if(repoMessagesDiv.style.display=="none") {
        repoMessagesDiv.style.display="block";
        toggleSpan.innerHTML = "[-]";
      } else {
        repoMessagesDiv.style.display="none";
        toggleSpan.innerHTML = "[+]";
      }
}

function hideRepoMessages(repoName) {
    if(Object.entries(repoData[repoName].messages).length>0) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      repoMessagesDiv.style.display="none";
      toggleSpan.innerHTML = "[+]";
    }
}

function showRepoMessages(repoName) {
    if(Object.entries(repoData[repoName].messages).length>0) {
      const toggleSpan = document.getElementById("toggle-"+repoName);
      const repoMessagesDiv = document.getElementById("repo-messages-"+repoName);
      repoMessagesDiv.style.display="block";
      toggleSpan.innerHTML = "[-]";
    }
}

function actionHandler(evt) {
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
    else return true;
}



function renderRepo(parentElement, data) {
  const repoDiv = document.createElement("div");
  repoDiv.id = "repo-"+data.repoName;
  repoDiv.className = "repo";
  repoDiv.style.backgroundColor = data.status.colour;
  var innerHTML = data.repoName;
  if(Object.entries(data.messages).length>0) {
      innerHTML += " : <span id=\"toggle-"+data.repoName+"\" data-repo-name=\""+data.repoName+"\" class=\"toggle link-hover\">[-]</span>";
  }
  innerHTML += "<br/><div id=\"repo-messages-"+data.repoName+"\" class=\"repo-messages\"></div>";
  repoDiv.innerHTML = innerHTML;
  parentElement.appendChild(repoDiv);

  for(var [key, message] of Object.entries(data.messages)) {
    renderRepoMessage(data.repoName, message);
  }
}


function Message(key, english, welsh){
  this.key = key;
  this.english = english;
  this.welsh = welsh;
}


function renderRepoMessage(repoName, message) {
    const parentDiv = document.getElementById("repo-messages-"+repoName);
    const div = document.createElement("div");
    div.id = "repo-message-"+repoName+"-"+message.key;
    div.className = "repo-message";
    if(!message.welsh) {
      div.style.backgroundColor = STATUS.NO_WELSH.colour;
    }
    var innerHTML = "<div class=\"message-key\">"+message.key+"</div>";
    innerHTML += "<div id=\"repo-message-"+repoName+"-"+message.key+"-english\" class=\"message-english\">"+message.english+"</div>";
    innerHTML += "<div id=\"repo-message-"+repoName+"-"+message.key+"-welsh\" class=\"message-welsh\">"+message.welsh+"</div>";
    div.innerHTML = innerHTML;
    parentDiv.appendChild(div);
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
  if(location.href.indexOf(appName)>-1) {
    //unselect 'Repositories' nav link
    document.querySelector("a[class='UnderlineNav-item no-wrap selected']").className="UnderlineNav-item no-wrap";

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
          if(data != {}) {
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
      return parseEnglishMessagesFile(repoName)
          .then((englishMessages)=>{
            const messages = {};
            if(Object.entries(englishMessages).length>0) {
                parsedMessagesFiles++;
            }
            for (const [key, value] of Object.entries(englishMessages)) {
              messages[key] = {key:key, english:value, welsh:""};
            }
            return messages;
          })
          .then((messages)=>{
            return parseWelshMessagesFile(repoName).then((welshMessages)=>{
              const data = {repoName: repoName, status:STATUS.OK, messages:{}};
              if(Object.entries(messages).length==0) {
                data.status = STATUS.NO_MESSAGES;
              }
              else if(Object.entries(welshMessages).length==0) {
                data.status = STATUS.NO_WELSH;
              }
              else {
                 parsedMessagesFiles++;
                for (const [key, obj] of Object.entries(messages)) {
                  if(welshMessages.hasOwnProperty(key)) {
                    messages[key].welsh = welshMessages[key];
                  }
                  else {
                    messages[key].welsh = "";
                    data.status = STATUS.WELSH_GAPS;
                  }
                }
              }
              processedRepos++;
              setHeaderText("Parsed "+parsedMessagesFiles+" messages files from "+processedRepos+"/"+repoNames.length+" repositories.");
              data.messages = messages;
              return data;
            });
          })
    }


   //returns a promise for an array of Message objects parsed from english messages file
    function parseEnglishMessagesFile(repoName) {
      return parseMessagesFile(repoName, "messages");
    }

      //returns a promise for an array of Message objects parsed from welsh messages file
    function parseWelshMessagesFile(repoName) {
      return parseMessagesFile(repoName, "messages.cy");
    }


    //returns a promise for an messages objects parsed from a messages file
    // where messages is of the form {key1: "messageText1", key2: "messageText2"}
    function parseMessagesFile(repoName, fileName) {
      return loadFileLinesFromConfFolder(repoName, fileName)
            .then((lines)=>{
              const messages = {};
              try {
                  console.info("Found "+lines.length+" lines in "+fileName+" for "+repoName+"..");
                  const cleanedLines = lines.map((line)=>line.trim()).filter((line)=>!line.startsWith("#"));
                  cleanedLines.map((line)=>{
                    const [key, value] = line.split("=");
                    messages[key.trim()] = value.trim();
                  })
                  return messages;
              } catch(e) {
                console.error("Failed to parse "+fileName+" file from "+repoName);
                console.error(e);
                return messages;
              }
            });
    }


    function loadFileLinesFromConfFolder(repoName, fileName) {
      return parseTextFileLinesFromGitHub("https://github.com/hmrc/"+repoName+"/blob/master/conf/"+fileName);
    }

    //parses text from given github source page url, returns promise for subscribing to asynch page parsing response
    function parseTextFileLinesFromGitHub(sourcePageUrl) {
        const codeLineRegexPattern = 'class="blob-code blob-code-inner js-file-line">(.*?)</td>';
        const codeLineTDRegex = new RegExp(codeLineRegexPattern, 'g');
        const codeLineRegex = new RegExp(codeLineRegexPattern);



        return fetch(sourcePageUrl, {credentials: "include", redirect: "follow"})
        .then(response => response.text())
        .then(responseText => {
            //parse the page source and extract all code lines, which can be found with css selector td.blob-code
            //this is because the raw url can't be accessed due to Content-Security-Polocy
            //class="blob-code blob-code-inner js-file-line">        port = 9982</td>

            var codeLineTableCells = responseText.match(codeLineTDRegex) || [];
            var codeLines = codeLineTableCells.map(codeLine=>{
                var textLine = codeLine.match(codeLineRegex)[1].trim();
                if(textLine.startsWith("<span")) {
                    textLine = textLine.replace(/<span[^>]+>/g, '').replace(/<\/span[^>]*>/g, '').replace(/\n/g, '');
                }
                textLine = textLine.replace(/&quot;/g, '"').replace(/&#39;/g, '\'');
                return textLine;
            });
            return codeLines;
        })
    }

init();

return {
  props:props,
  actionHandler:actionHandler
};

})();

window.teamServiceMessages = teamServiceMessages;



