
// current number of context menu sub-items
// (to know later on how many menu items have to be deleted)
var contextMenuCreated = 0;

var isLastFileProc = 0;

var mediaId = [];
var mediaTitle = [];
var media = [];

var currentTabId = null;

function outputMedia()
{
    console.log("#media entries: "+mediaId.length);
    for (var k=0; k<mediaId.length; k++)
    {
        if (mediaId[k])
        {
            console.log("media[tab "+k+"] = "+mediaId[k]);
        }
    }
}

/*
    addSrfContextMenu():
    Creates the context menu entry to launch the URL extraction
*/
function addSrfContextMenu()
{
    browser.contextMenus.create({
        id: "srfch_context",
        title: "Extract SRF URLs",
        contexts: ["link"]
    });
    
    contextMenuCreated = 1;
}

/*
    signalMediaAvailable():
    Signal to the popup in the browser toolbar that there are media files available
*/
function signalMediaAvailable()
{
    var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
    gettingActiveTab.then((tabs) => {
        currentTabId = tabs[0].id;
        browser.pageAction.show(currentTabId);
    });
}

/*
    signalMediaDisable():
    Signal to the popup in the browser toolbar that currently nothing is available there
*/
function signalMediaDisable(tabId)
{
    browser.pageAction.hide(tabId);
    mediaId[tabId] = "";
    mediaTitle[tabId] = "";
    media[tabId] = [];
}

/*
    parseM3uPlaylist():
    Parses an M3U playlist file to find the URLs of all the media files
    linked to in this playlist
*/
function parseM3uPlaylist(e)
{
    // read the playlist file
    var playlistContents = this.responseText;

    // check if an error occurred while downloading the playlist file. This could mean 
    // that we've guessed a non-existing HQ playlist file...
    if (playlistContents.indexOf("An error occurred while processing your request") >= 0)
    {
        return;
    }
    
    // prepare the URL for later use...
    var url = this.responseURL;
    url = url.replace(/master.m3u8/g,"");
    
    // check for tracks stored in the playlist (according to http://en.wikipedia.org/wiki/M3U 
    // such entries have an    #EXTINF on the previous line or according to 
    // https://developer.apple.com/library/ios/technotes/tn2288/_index.html an EXT-X-STREAM-INF 
    // indicating that the following file is another playlist). Trials however show that for the 
    // srf.ch webpage only the latter case is used in a first place. Therefore we're only seeking
    // those entries...
    var mediaFilePlaylist = playlistContents.match( /#EXT-X-STREAM-INF[^#]*/g );
    for (var i=0; i<mediaFilePlaylist.length; i++)
    {
        // remove the \r (present on some architectures)
        mediaFilePlaylist[i] = mediaFilePlaylist[i].replace(/\r/g,"");
        // extract the description of this stream (will be displayed in the contex menu)
        var idxNewline = mediaFilePlaylist[i].indexOf("\n");
        if (idxNewline < 0)
        {
            continue;
        }
        
        // test if the media file URLs in this M3U file are given as absolute or relative URLs. 
        // In the case of relative URLs the path of the M3U file has to be prepended
        var thisStreamURL = "";
        if (mediaFilePlaylist[i].substring(idxNewline+1).match( /^http[s]?:/g ))
        {
            thisStreamURL = mediaFilePlaylist[i].substring(idxNewline+1).replace(/\n/g,"");
        }
        else
        {
            thisStreamURL = url + mediaFilePlaylist[i].substring(idxNewline+1).replace(/\n/g,"");
        }
        
        // it seems that the https:// URLs can be downloaded easily as http:// URLs...
        if (thisStreamURL.match(/^https:/g))
        {
            thisStreamURL = thisStreamURL.replace(/^https:/g, "http:");
        }
        
        var isNewEntry = 1;
        // make the URL comparable, i.e. 1. remove the domain (because different (sub)domains
        // may be used
        var thisStreamURL_cmp = thisStreamURL.replace(/http:\/\/[^\/]*\//i,"");
        // 2. remove everything after the filename
        thisStreamURL_cmp = thisStreamURL_cmp.replace(/\?[^\/]*$/i,"");
        // 3. remove the q*-information
        thisStreamURL_cmp = thisStreamURL_cmp.replace(/q[1-6]0,/gi,"");
        // check if this URL has not yet been stored in the URL array
        for (var j=0; j<media[currentTabId].length; j++)
        {
            // it seems that the master.m3u8 files are split into normal and high quality
            // streams. However, the high quality master.m3u8 files still contain also the 
            // "normal" quality streams. playlists with different qXX in the address are 
            // linked to the exact same streams. Therefore these values are sorted out 
            // here to prevent dupliate entries...
            // prepare the URL in the same way like above just outside the for-loop
            var urlInMenu = media[currentTabId][j].url.replace(/http:\/\/[^\/]*\//i,"");
            urlInMenu = urlInMenu.replace(/q[1-6]0,/gi,"");
            if (thisStreamURL_cmp==urlInMenu.replace(/\?[^\/]*$/i,""))
            {
                isNewEntry = 0;
                break;
            }
        }
        
        if (isNewEntry)
        {
            media[currentTabId][media[currentTabId].length] = {
                    'guessed': false,
                    'url': thisStreamURL,
                    'desc': 'M3U: ' + mediaFilePlaylist[i].substring(18,idxNewline)
                };
        }
    }
    
    // this was the last file to be processed. Therefore flag the results
    // as "done"
    if (isLastFileProc)
    {
        signalMediaAvailable();
    }
}

/*
    extractM3uPlaylist():
    Parses some text (typically it's a JSON string) and extracts the M3U playlist files
    and initiates the parsing of these files
*/
function extractM3uPlaylist(jsonString)
{
    var playlistURL = jsonString.match( /http[^"<>]*\/master\.m3u8/g );
    
    if (!playlistURL)
    {
        // it seems that there's no M3U URL stored for this media
        return;
    }
    
    // pre-process the list of playlist files and add potential HQ playlists...
    var numPlaylistURL = playlistURL.length;
    for (var k=0; k<numPlaylistURL; k++)
    {
        // unescape the URL
        var urlk = playlistURL[k].replace(/\\\//g,"/");
        
        // check if it's a playlist for files with low resolution for which we might find
        // a high resolution playlist. Highest quality playlists (usually) end with 
        // "q60,.mp4.csmil/master.m3u8"
        if (urlk.match(/q[^6]0,\.mp4\.csmil\/master\.m3u8/g))
        {
            // replace the qXX part by "q10,q20,q30,q40,q50,q60"
            var hqURL_60 = urlk.replace(/_,q[,q0-9]*0/g,"_,q10,q20,q30,q40,q50,q60");

            // it seems that the HQ playlists are stored on the srfvodhd-vh.akamaihd.net 
            // subdomain. Therefore if the current playlist is located on the 
            // hdvodsrforigin-f.akamaihd.net subdomain relocate the URL.
            hqURL_60 = hqURL_60.replace(/hdvodsrforigin-f\.akamaihd\.net/g,"srfvodhd-vh.akamaihd.net");
            
            // append the URL to the already existing list of URLs
            playlistURL[playlistURL.length] = hqURL_60;
        }
        
        // same like above but this time nor q60 or q50, and adding q50
        if (urlk.match(/q[^56]0,\.mp4\.csmil\/master\.m3u8/g))
        {
            // replace the qXX part by "q10,q20,q30,q40,q50"
            var hqURL_50 = urlk.replace(/_,q[,q0-9]*0/g,"_,q10,q20,q30,q40,q50");

            // it seems that the HQ playlists are stored on the srfvodhd-vh.akamaihd.net 
            // subdomain. Therefore if the current playlist is located on the 
            // hdvodsrforigin-f.akamaihd.net subdomain relocate the URL.
            hqURL_50 = hqURL_50.replace(/hdvodsrforigin-f\.akamaihd\.net/g,"srfvodhd-vh.akamaihd.net");
            
            // append the URL to the already existing list of URLs
            playlistURL[playlistURL.length] = hqURL_50;
        }
    }
    
    isLastFileProc = 0;
    
    // check each obtained playlist file...
    for (var k=0; k<playlistURL.length; k++)
    {
        if (k==playlistURL.length-1)
        {
            isLastFileProc = 1;
        }
        
        // unescape the URL
        var urlk = playlistURL[k].replace(/\\\//g,"/");
        
        // it seems that they try to protect some of the playlists by HTTPS requests. A quick check
        // however showed that these playlist files could also be accessed by slightly modifying
        // the URL
        if (urlk.indexOf("https://codch-vh.akamaihd.net") >= 0)
        {
            urlk = urlk.replace("https://codch-vh.akamaihd.net", "http://codww-vh.akamaihd.net");
        }
        
        // read the M3U playlist file using an (asynchronous) HTTP request
        var oReq = new XMLHttpRequest();
        oReq.addEventListener("load", parseM3uPlaylist);
        
        // asynchronously read the contents of the given URL
        oReq.open("GET", urlk, 1);
        oReq.send();
    }
}

/*
    readCvisUrl():
    Reads the contents of an URL which contain information about the media URL
*/
function readCvisUrl(url)
{
    // reqListener():
    // Handles the (asynchronous) read request answer
    function reqListener () {
        // try to parse the response as JSON object
        var jsonResponse = JSON.parse(this.responseText);
        
        // try to get the title of the media file
        mediaTitle[currentTabId] = "";
        if (jsonResponse.Video)
        {
            if (jsonResponse.Video.AssetMetadatas && jsonResponse.Video.AssetMetadatas.AssetMetadata
                && jsonResponse.Video.AssetMetadatas.AssetMetadata[0].title)
            {
                mediaTitle[currentTabId] = jsonResponse.Video.AssetMetadatas.AssetMetadata[0].title;
            }
            else if (jsonResponse.Video.AssetSet && jsonResponse.Video.AssetSet.title)
            {
                mediaTitle[currentTabId] = jsonResponse.Video.AssetSet.title;
            }
        }
        
        // no title found so far, just try to find some title string...
        if (!mediaTitle[currentTabId])
        {
            var titles = this.responseText.match(/"title":\s*"[^"]+"/g);
            if (titles.length >= 1)
            {
                mediaTitle[currentTabId] = titles[0].substr(7);
                mediaTitle[currentTabId] = mediaTitle[currentTabId].substr(0, mediaTitle[currentTabId].length-1); // remove the trailing quote
                mediaTitle[currentTabId] = mediaTitle[currentTabId].substr(mediaTitle[currentTabId].indexOf('"')+1);
            }
        }
        
        // try to find the media files as M3U playlists
        extractM3uPlaylist(this.responseText);
    }

    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", reqListener);
    
    // asynchronously read the contents of the given URL
    oReq.open("GET", url, 1);
    oReq.send();
}

/*
    getCvisUrl():
    Reads out the "media file ID" of the link that was clicked and returns the
    URL from where information about the file can be obtained
*/
function getCvisUrl(linkurl)
{
    // link must refer to the SF-videoportal
    var isStyle1 = ( linkurl.substring(0,22)=="http://www.srf.ch/play" 
        || linkurl.substring(0,30)=="http://videoportal.sf.tv/video" );
    var isStyle2 = ( linkurl.match(/tp\.srgssr\.ch.*video/g) ? 1 : 0 );
    var isStyle3 = ( linkurl.match(/urn:srf:.*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ? 1 : 0 );
    var isStyleRsi1 = ( linkurl.match(/urn:rsi:video:[0-9]{7}/) ? 1 : 0 );
    var isStyleRsi2 = ( linkurl.match(/rsi.ch\/play\/.*id=[0-9]{7}/) ? 1 : 0 );
    if (!isStyle1 && !isStyle2 && !isStyle3 && !isStyleRsi1 && !isStyleRsi2)
    {
        return "";
    }
        
    var idStr = "";
    
    if (isStyle1)
    {
        // remove the first part of the URL, such that it starts with the id
        var idx = linkurl.indexOf("?id");
        var idStr = linkurl.substring( idx+4 );
        
        // check if after the id some more text follows...
        idx = idStr.indexOf("&");
        if( idx>0 )
        {
            idStr = idStr.substring( 0, idx );
        }
    }
    else if (isStyle2 || isStyle3)
    {
        var idMatch = linkurl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        if (idMatch.length)
        {
            idStr = idMatch[0];
        }
        else
        {    // something failed, the ID is not of the expected format...
            return "";
        }
    }
    else if (isStyleRsi1)
    {
        idStr = linkurl.substr(14, 7);
    }
    else if (isStyleRsi2)
    {
        var idMatch = linkurl.match(/id=[0-9]{7}/);
        if (idMatch.length)
        {
            idStr = idMatch[0].substr(3);
        }
    }
    
    // check if it's an audio or video file or if it's from RSI.
    // If it's an audio file prepend a "a", if it's a video file prepend
    // a "v". If it's none of the two return an empty string
    if (idStr)
    {
        if (isStyleRsi1 || isStyleRsi2)
        {
            return "http://il.srgssr.ch/integrationlayer/1.0/ue/rsi/video/play/"+idStr+".json";
        }
        else if (linkurl.indexOf("audio")>=0)
        {
            return "http://www.srf.ch/webservice/ais/report/audio/withLiveStreams/"+idStr+".xml";
        }
        else if (linkurl.indexOf("video")>=0)
        {
            return "http://il.srgssr.ch/integrationlayer/1.0/ue/srf/video/play/"+idStr+".json";
        }
        else
        {
            return "";
        }
    }
    else
    {
        return "";
    }
}

/*
    srfchProcMsg():
    Process the messages received from the content script
*/
function srfchProcMsg(request, sender, sendResponse)
{
    // first remove the context menu for the SRF URLs and
    // disable the toolbar button (will be activated later)
    if (contextMenuCreated)
    {
        // top-item
        browser.contextMenus.remove("srfch_context");
        contextMenuCreated = 0;
    }
    
    // if we got the tab-id already with the command, then we don't
    // have to extract it once more...
    if (sender.tab && (typeof sender.tab.id !== 'undefined'))
    {
        currentTabId = sender.tab.id;
        
        // first reset the popup (and the underlying data)
        signalMediaDisable(currentTabId);
        
        // second - if an ID is part of the request - process
        // the ID information further
        if (request.srfchId)
        {
            mediaId[currentTabId] = request.srfchId;
            addSrfContextMenu();
        }
    }
    else
    {
        // we need to find out which tab we're actually dealing with...
        var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
        gettingActiveTab.then((tabs) => {
            currentTabId = tabs[0].id;
            
            // first reset the popup (and the underlying data)
            signalMediaDisable(currentTabId);
            
            // second - if an ID is part of the request - process
            // the ID information further
            if (request.srfchId)
            {
                mediaId[currentTabId] = request.srfchId;
                addSrfContextMenu();
            }
        });
    }
}

/*
    event listener for messages from the content script. Assign the messages
    to function srfchProcMsg()
*/
browser.runtime.onMessage.addListener(srfchProcMsg);

/*
    event listener for clicks on the add on's context menu entry
*/
browser.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId == "srfch_context")
    {
        if (mediaId[tab.id])
        {
            var cvisUrl = getCvisUrl(mediaId[tab.id]);
            
            if (cvisUrl)
            {
                readCvisUrl(cvisUrl);
            }
        }
    }
});
