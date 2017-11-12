
var contentLoaded = 0;

// initialize the data for this tab (and remove the pageAction popup initially)
if (!contentLoaded)
{
    // only send this message once (otherwise already existing data could be
    // reset to zero)
    contentLoaded = 1;
    browser.runtime.sendMessage({});
}

if (document.documentURI
    && document.documentURI.match(/srf\.ch\/play\/.*\/video\/.*id=[-a-zA-Z0-9]{36}/g))
{
    addSrfPlayBanner();
}


document.addEventListener("load", function(event) {
    // send an empty message to the background script. This makes the toolbar-popup
    // being disabled (by default) and the context menu being removed (if it exists)
    if (!contentLoaded)
    {
        // only send this message once (otherwise already existing data could be
        // reset to zero)
        contentLoaded = 1;
        browser.runtime.sendMessage({});
    }
}, true);
window.addEventListener("beforeunload", function(event) {
    // send an empty message to the background script. This makes the toolbar-popup
    // being disabled (by default) and the context menu being removed (if it exists)
    browser.runtime.sendMessage({});
}, true);

window.addEventListener("mousedown", function(event) {
    // right click
    // (this will probably trigger the context menu to pop up)
    if (event.button == 2)
    {
        var idStr = '';
        
        // check if (right-) clicked on a link
        if (event.target && event.target.closest('a'))
        {
            // check if the "urn" data attribute is set, then we can easily extract the
            // media's ID from it
            var elemA = event.target.closest('a');
            if (elemA.dataset.urn)
            {
                idStr = elemA.dataset.urn;
            }
            else
            {
                // sometimes the ID is hidden somehow behind another node in the
                // DOM tree which is linked via the "href"-attribute. Check this option...
                var hrefAttr = elemA.getAttribute("href");
                if (hrefAttr && hrefAttr.substring(0,1)==="#")
                {
                    var promoId = hrefAttr.substring(1);
                    
                    // check if a node with this id exists
                    var promoNode = document.getElementById(promoId);
                    if (promoNode)
                    {
                        // check if any of the child elements there's the 'data-urn'
                        // attribute set
                        var promoChildren = promoNode.getElementsByTagName("*");
                        
                        for (var i=0; i<promoChildren.length; i++)
                        {
                            if(promoChildren[i].dataset && promoChildren[i].dataset.urn)
                            {
                                idStr = promoChildren[i].dataset.urn;
                                break;
                            }
                        }
                    }
                }
            
                // if we didn't find the "urn" data attribute yet, then we can try to extract
                // the ID from the "href" attribute of the link node. To do so, try to find
                // the ID using a regex
                if (idStr=='' && hrefAttr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/))
                {
                    idStr = hrefAttr;
                }
            }
        }
        
        // if the string with the ID was set then we can forward this information (via a
        // message) to the background script which can then do the actual extraction of
        // the URLs
        console.log("content: send id: "+idStr);
        browser.runtime.sendMessage({srfchId: idStr});
    }
}, true); 

// the rsi.ch page is a bit a tricky case, because it embeds the videos in iframes
// whose source is on srgssr.ch. Therefore we have some cross-domain problem. Since
// the content script is not allowed to interfere with the iframes and cannot catch
// mouse events there, we just have to add some visual element close to the iframe
// (similar like for the srf.ch/play page)
if (document.documentURI && (document.documentURI.indexOf("rsi.ch") >= 0))
{
    var iframes = document.getElementsByTagName("iframe");
    if (iframes)
    {
        for (var k=0; k<iframes.length; k++)
        {
            if (iframes[k].src.indexOf("srgssr.ch") >= 0)
            {
                var urnrsi = iframes[k].src.match(/urn:rsi:video:[0-9]{7}/);
                if (urnrsi.length==1)
                {
                    addRsiVideoBanner(iframes[k], urnrsi[0]);
                }
            }
        }
    }
}

/*
    addRsiVideoBanner():
    Since on rsi.ch the videos are 
*/
function addRsiVideoBanner(iframe, urn)
{
    // check if this event has already fired and there's already a download link
    // node added to the page.
    if (document.getElementsByClassName("srfchaddon").length > 0)
    {
        return;
    }
    
    var nodeParent = iframe.parentNode;
    
    // add the following HTML code to the current document's DOM tree:
    // <div style="text-align:center">
    //     <img class="srfchaddon" src="http://addons.cdn.mozilla.net/user-media/addon_icons/413/413748-64.png" />
    //       Download URLs for this video (right-click)
    //     <br/>
    //     <br/>
    // </div>
    var downloadImg = document.createElement("img");
    downloadImg.setAttribute("class", "srfchaddon");
    downloadImg.setAttribute("src", "http://addons.cdn.mozilla.net/user-media/addon_icons/413/413748-64.png");
    
    var downloadA   = document.createElement("a");
    downloadA.setAttribute("href", iframe.src);
    downloadA.dataset.urn = urn;
    
    // set text of link
    var downloadAtext = document.createTextNode(" Download URLs for this video (right-click)");
    downloadA.appendChild(downloadAtext);
    
    var downloadDiv = document.createElement("div");
    downloadDiv.setAttribute("style", "text-align:center");
    downloadDiv.appendChild(downloadImg);
    downloadDiv.appendChild(downloadA);
    
    // (two) bracket returns
    downloadDiv.appendChild(document.createElement('br'));
    downloadDiv.appendChild(document.createElement('br'));
    
    nodeParent.insertBefore(downloadDiv, iframe);
}

/*
    addSrfPlayBanner():
    On some srf.ch pages (in particular srf.ch/play/...) the ID of the video is directly
    accessible in the address of the page. However, to let the add-on work also in this
    case a banner needs to be added such that the "normal" functions can be used
*/
function addSrfPlayBanner()
{
    // check if this event has already fired and there's already a download link
    // node added to the page.
    var downloadUrlFound = 0;
    if (document.getElementsByClassName("srfchaddon").length > 0)
    {
        downloadUrlFound = 1;
    }
    
    // current tab seems to be a srf.ch page
    // try to find out if it's really an SRF-play page...
    var isSrfPlay = 0;
    var metaElements = document.getElementsByTagName("meta");
    if (!downloadUrlFound && metaElements && metaElements.length > 0)
    {
        for (var i=0; i<metaElements.length; i++)
        {
            var siteName = 0;
            var content = '';
            for (var k=0; k<metaElements[i].attributes.length; k++)
            {
                if (metaElements[i].attributes[k].name === "property"
                    && metaElements[i].attributes[k].value === "og:site_name")
                {
                    siteName = 1;
                }
                else if (metaElements[i].attributes[k].name === "content")
                {
                    content = metaElements[i].attributes[k].value;
                }
            }
            
            if (siteName && content === "Play SRF")
            {
                isSrfPlay = 1;
            }
        }
    }
    
    if (isSrfPlay)
    {
        var nestedRowElement = document.getElementsByClassName("detailPageLeftCol");
        if (!(nestedRowElement && nestedRowElement.length==1))
        {
            nestedRowElement = document.getElementsByClassName("nestedRow");
        }
        
        if (nestedRowElement)
        {
            // add the following HTML code to the current document's DOM tree:
            // <div style="text-align:center">
            //     <img class="srfchaddon" src="http://addons.cdn.mozilla.net/user-media/addon_icons/413/413748-64.png" />
            //       Download URLs for this video (right-click)
            //     <br/>
            //     <br/>
            // </div>
            var downloadImg = document.createElement("img");
            downloadImg.setAttribute("class", "srfchaddon");
            downloadImg.setAttribute("src", "http://addons.cdn.mozilla.net/user-media/addon_icons/413/413748-64.png");
            
            var downloadA   = document.createElement("a");
            downloadA.setAttribute("href", document.documentURI);
            
            // set text of link
            var downloadAtext = document.createTextNode(" Download URLs for this video (right-click)");
            downloadA.appendChild(downloadAtext);
            
            var downloadDiv = document.createElement("div");
            downloadDiv.setAttribute("style", "text-align:center");
            downloadDiv.appendChild(downloadImg);
            downloadDiv.appendChild(downloadA);
            
            // (two) bracket returns
            downloadDiv.appendChild(document.createElement('br'));
            downloadDiv.appendChild(document.createElement('br'));
            
            var rowParent = nestedRowElement[0].parentElement;
            rowParent.insertBefore(downloadDiv, nestedRowElement[0]);
        }
    }
}