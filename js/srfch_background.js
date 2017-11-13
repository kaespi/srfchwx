
// since a M3U playlist file may link to multiple further playlist files and they are processed
// asynchronously we have to know when the last one was processed such that afterwards to pageAction
// can be enabled
var isLastFileProc = 0;

// array containing for each tab the ID of the media on which the right-click happened
var mediaId = [];
// array containing for each tab the title of the media for which the URLs were extracted
var mediaTitle = [];
// array consisting of for each tab an array with the URLs. Each entry a struct of type
//  {
//    'guessed': <false or true, legacy, right now not used>,
//    'url':     <URL of the video/audio stream/file>,
//    'desc':    <some descriptive string for this particular URL (e.g. for quality/resolution/...)
//  }
var media = [];
// array containing for each tab the string denoting the broadcaster (either 'rsi' or empty). This
// one is used to check which icon should be displayed
var broadcaster = [];

// array consisting of for each tab an array of M3U URLs to be downloaded/parsed with Akamai token
var m3uUrls = [];

// id of the tab currently opened/processed
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
    // on RSI pages we have to check not only links. Therefore we add two
    // context menu entries. One for srf.ch and one for rsi.ch. But since
    // we're only surfing on one at a time they won't popup at the concurrently
    browser.contextMenus.create({
        id: "srfch_context",
        title: browser.i18n.getMessage("contextMenuExtract", "SRF"),
        documentUrlPatterns: ["*://*.srf.ch/*"],
        contexts: ["link"]
    });
    browser.contextMenus.create({
        id: "rsich_context",
        title: browser.i18n.getMessage("contextMenuExtract", "RSI"),
        documentUrlPatterns: ["*://*.rsi.ch/*"],
        contexts: ["link"]
    });
}

/*
    signalMediaAvailable():
    Signal to the popup in the browser toolbar that there are media files available
*/
function signalMediaAvailable(numMediaFound)
{
    var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
    gettingActiveTab.then((tabs) => {
        currentTabId = tabs[0].id;
        browser.pageAction.setTitle({
            tabId: currentTabId,
            title: numMediaFound + " " + browser.i18n.getMessage("pageActionNUrlsFound") });
        if (broadcaster[currentTabId] === "rsi")
        {
            browser.pageAction.setIcon({
                tabId: currentTabId,
                path: { "32": "icons/rsich_32.png", "48": "icons/rsich_48.png" } });
        }
        else
        {
            browser.pageAction.setIcon({
                tabId: currentTabId,
                path: { "32": "icons/srfch_32.png", "48": "icons/srfch_48.png" } });
        }
        browser.pageAction.show(currentTabId);
    });
}

/*
    signalMediaDisable():
    Signal to the popup in the browser toolbar that currently nothing is available there
*/
function signalMediaDisable(tabId)
{
    browser.pageAction.setTitle({
        tabId: tabId,
        title: browser.i18n.getMessage("pageActionTooltip") });
    browser.pageAction.hide(tabId);
    mediaId[tabId] = "";
    mediaTitle[tabId] = "";
    media[tabId] = [];
    broadcaster[tabId] = "";
}

/*
    parseAkamaiToken():
    Parses the response from the Akamai server for the authorization token and launches
    the HTTP queries for the (queued) m3u URLs
*/
function parseAkamaiToken(e)
{
    if (this.responseText)
    {
        // try to parse the response as JSON object
        var jsonResponse;
        var responseIsJson = 1;
        try {
            jsonResponse = JSON.parse(this.responseText);
        } catch(e) {
            responseIsJson = 0;
        }

        for (var k=0; k<m3uUrls[currentTabId].length; k++)
        {
            var urlk = m3uUrls[currentTabId][k];

            if (responseIsJson && jsonResponse.token
                && jsonResponse.token.authparams)
            {
                var token = jsonResponse.token.authparams;
                urlk += "?" + token;
            }

            // read the M3U playlist file using an (asynchronous) HTTP request
            var oReq = new XMLHttpRequest();
            oReq.addEventListener("load", parseM3uPlaylist);

            // asynchronously read the contents of the given URL
            oReq.open("GET", urlk, 1);
            oReq.send();
        }
    }

    m3uUrls[currentTabId] = [];
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
        signalMediaAvailable(media[currentTabId].length);
    }
}

/*
    extractNonM3uUrlsJson():
    Processes a JSON object and extracts the media URLs
    in this file (which could be mp3 files, RTMP streams, ...)
*/
function extractNonM3uUrlsJson(jsonObj)
{
    var anyUrlFound = 0;

    if (jsonObj.chapterList)
    {
        for (var ch=0; ch<jsonObj.chapterList.length; ch++)
        {
            var chapter = jsonObj.chapterList[ch];
            if (chapter.resourceList)
            {
                for (var r=0; r<chapter.resourceList.length; r++)
                {
                    var res = chapter.resourceList[r];
                    if (res.url)
                    {
                        // found an URL, but now we also need to have some descriptive
                        // string for the URL (indicating the quality e.g.)
                        var desc = '';
                        if (jsonObj.chapterList.length > 1 && chapter.title)
                        {
                            desc = chapter.title + ": ";
                        }
                        if (res.protocol)
                        {
                            desc += res.protocol;
                        }
                        if (res.quality)
                        {
                            desc += (desc ? ", " : "") + res.quality;
                        }
                        if (res.encoding)
                        {
                            desc += (desc ? ", " : "") + res.encoding;
                        }

                        media[currentTabId][media[currentTabId].length] = {
                                'guessed': false,
                                'url': res.url,
                                'desc': desc
                            };

                        anyUrlFound = 1;
                    }
                }
            }
        }
    }

    if (anyUrlFound)
    {
        signalMediaAvailable(media[currentTabId].length);
    }

    return anyUrlFound;
}

/*
    extractNonM3uUrlsAscii():
    Parses some ASCII string and extracts the media URLs
    in this file (which could be mp3 files, RTMP streams, ...)
*/
function extractNonM3uUrlsAscii(txt)
{
    var anyUrlFound = 0;

    // scan for RTMP files/streams
    var rtmpUrls = txt.match( /rtmp:[^"<>]+/g );
    if (rtmpUrls)
    {
        for (var k=0; k<rtmpUrls.length; k++)
        {
            var url_k = rtmpUrls[k];
            var isNewEntry = 1;

            // check if this URL has not yet been stored in the URL array
            for (var j=0; j<media[currentTabId].length; j++)
            {
                if (media[currentTabId][j].url === url_k)
                {
                    isNewEntry = 0;
                    break;
                }
            }

            if (isNewEntry)
            {
                anyUrlFound = 1;
                media[currentTabId][media[currentTabId].length] = {
                        'guessed': false,
                        'url': url_k,
                        'desc': url_k
                    };
            }
        }
    }

    // scan for mp3 files/streams
    var mp3Urls = txt.match( /http[^"<>]+mp3[^"<>]*/g );
    if (mp3Urls)
    {
        for (var k=0; k<mp3Urls.length; k++)
        {
            var url_k = mp3Urls[k];
            var isNewEntry = 1;

            // check if this URL has not yet been stored in the URL array
            for (var j=0; j<media[currentTabId].length; j++)
            {
                if (media[currentTabId][j].url === url_k)
                {
                    isNewEntry = 0;
                    break;
                }
            }

            if (isNewEntry)
            {
                anyUrlFound = 1;
                media[currentTabId][media[currentTabId].length] = {
                        'guessed': false,
                        'url': url_k,
                        'desc': url_k
                    };
            }
        }
    }

    if (anyUrlFound)
    {
        signalMediaAvailable(media[currentTabId].length);
    }

    return anyUrlFound;
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
        return false;
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
    m3uUrls[currentTabId] = [];
    var akamaiTokenRequested = 0;

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

        // ok, for RSI we need some Akamai token to be allowed to read/parse the master.m3u8
        // file we would like to, therefore we have to grad this one first...
        if (urlk.indexOf("/i/rsi/") >= 0)
        {
            console.log("found token needed: "+urlk);
            m3uUrls[currentTabId][m3uUrls[currentTabId].length] = urlk;

            if (!akamaiTokenRequested)
            {
                akamaiTokenRequested = 1;

                // read the token file using an (asynchronous) HTTP request
                var oReq = new XMLHttpRequest();
                oReq.addEventListener("load", parseAkamaiToken);

                // asynchronously read the contents of the given URL
                oReq.open("GET", "https://tp.srgssr.ch/akahd/token?acl=/i/rsi/*", 1);
                oReq.send();
            }
        }
        else if (urlk.indexOf("/i/rsi2/") >= 0)
        {
            console.log("found token needed: "+urlk);
            m3uUrls[currentTabId][m3uUrls[currentTabId].length] = urlk;

            if (!akamaiTokenRequested)
            {
                akamaiTokenRequested = 1;

                // read the token file using an (asynchronous) HTTP request
                var oReq = new XMLHttpRequest();
                oReq.addEventListener("load", parseAkamaiToken);

                // asynchronously read the contents of the given URL
                oReq.open("GET", "https://tp.srgssr.ch/akahd/token?acl=/i/rsi2/*", 1);
                oReq.send();
            }
        }
        else
        {
            // read the M3U playlist file using an (asynchronous) HTTP request
            var oReq = new XMLHttpRequest();
            oReq.addEventListener("load", parseM3uPlaylist);

            // asynchronously read the contents of the given URL
            oReq.open("GET", urlk, 1);
            oReq.send();
        }
    }

    return true;
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
        var jsonResponse;
        var responseIsJson = 1;
        try {
            jsonResponse = JSON.parse(this.responseText);
        } catch(e) {
            responseIsJson = 0;
        }

        // try to get the title of the media file
        mediaTitle[currentTabId] = "";
        if (responseIsJson && jsonResponse.Video)
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
        else if (responseIsJson && jsonResponse.episode && jsonResponse.episode.title)
        {
            mediaTitle[currentTabId] = jsonResponse.episode.title;
        }

        // no title found so far, just try to find some title string...
        if (!mediaTitle[currentTabId])
        {
            var titles = this.responseText.match(/"title"\s*:\s*"[^"]+"/g);
            if (titles && titles.length >= 1)
            {
                mediaTitle[currentTabId] = titles[0].substr(7);
                mediaTitle[currentTabId] = mediaTitle[currentTabId].substr(0, mediaTitle[currentTabId].length-1); // remove the trailing quote
                mediaTitle[currentTabId] = mediaTitle[currentTabId].substr(mediaTitle[currentTabId].indexOf('"')+1);
            }
        }

        // try to find the media files as M3U playlists
        if (!extractM3uPlaylist(this.responseText))
        {
            // try to find non-M3U media URLs in the file
            var fileParsed = 0;
            if (responseIsJson)
            {
                fileParsed = extractNonM3uUrlsJson(jsonResponse);
            }

            if (!fileParsed)
            {
                extractNonM3uUrlsAscii(this.responseText);
            }
        }
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
    var isStyle4 = ( linkurl.match(/play.*id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ? 1 : 0 );
    var isStyleRsi1 = ( linkurl.match(/urn:rsi:video:[0-9]{7}/) ? 1 : 0 );
    var isStyleRsi2 = ( linkurl.match(/rsi.ch\/play\/.*id=[0-9]{7}/) ? 1 : 0 );
    if (!isStyle1 && !isStyle2 && !isStyle3 && !isStyle4 && !isStyleRsi1 && !isStyleRsi2)
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
    else if (isStyle2 || isStyle3 || isStyle4)
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
            return "https://il.srgssr.ch/integrationlayer/2.0/srf/mediaComposition/audio/"+idStr+".json";
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
            }
        });
    }
}

// add the SRF context menu (by default for all links)
// (originally I thought I want to add the context menu entry once a message is
// received from the content script. But apparently the context menu could be
// rendered before the message in the background script is processed. Therefore
// the context menu is added permanently)
addSrfContextMenu();

/*
    event listener for messages from the content script. Assign the messages
    to function srfchProcMsg()
*/
browser.runtime.onMessage.addListener(srfchProcMsg);

/*
    event listener for clicks on the add on's context menu entry
*/
browser.contextMenus.onClicked.addListener(function(info, tab)
{
    if (info.menuItemId == "srfch_context" ||
        info.menuItemId == "rsich_context")
    {
        if (mediaId[tab.id])
        {
            var cvisUrl = getCvisUrl(mediaId[tab.id]);

            if (cvisUrl)
            {
                console.log("reading URL "+cvisUrl);
                broadcaster[tab.id] = "";
                if (cvisUrl.indexOf("rsi") >= 0)
                {
                    broadcaster[tab.id] = "rsi";
                }
                readCvisUrl(cvisUrl);
            }
        }
        else
        {
            if (info.menuItemId == "srfch_context")
            {
                // mark as nothing found
                browser.pageAction.setTitle({
                    tabId: tab.id,
                    title: browser.i18n.getMessage("pageActionNothingFound") });
                browser.pageAction.setIcon({
                    tabId: tab.id,
                    path: {"32": "icons/srfch_disabled_32.png", "48": "icons/srfch_disabled_48.png"} });
            }
            else if (info.menuItemId == "rsich_context")
            {
                // mark as nothing found
                browser.pageAction.setTitle({
                    tabId: tab.id,
                    title: browser.i18n.getMessage("pageActionNothingFound") });
                browser.pageAction.setIcon({
                    tabId: tab.id,
                    path: {"32": "icons/rsich_disabled_32.png", "48": "icons/rsich_disabled_48.png"} });
            }
            browser.pageAction.show(tab.id);
        }
    }
});
