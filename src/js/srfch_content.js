// SRF.ch Firefox extension, content script
// Copyright (C) 2017 Kaspar Giger (sftv@kgmw.ch)
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software Foundation,
// Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301  USA


// upon loading the content script we send an empty message to the background
// script such that the background script's data for this tab is initialized
// and the pageAction safely hidden
var contentLoaded = 0;

// initialize the data for this tab (and remove the pageAction popup initially)
if (!contentLoaded)
{
    // only send this message once (otherwise already existing data could be
    // reset to zero)
    contentLoaded = 1;
    browser.runtime.sendMessage({});
}

document.addEventListener("load", function(event) {
    // on srf.ch/play pages the video usually just starts without given this add-on the
    // possibility to extract the video's URL, although the id of the video is nicely
    // contained in the URL. If this is the case then add a banner on top of the video
    // to make this add-on work even in this situation
    if (document.documentURI
        && document.documentURI.match(/srf\.ch\/play\/.*\/video\/.*id=[-a-zA-Z0-9]{36}/g))
    {
        addSrfPlayBanner();
    }
    // the rsi.ch page is a bit a tricky case, because it embeds the videos in iframes
    // whose source is on srgssr.ch. Therefore we have some cross-domain problem. Since
    // the content script is not allowed to interfere with the iframes and cannot catch
    // mouse events there, we just have to add some visual element close to the iframe
    // (similar like for the srf.ch/play page)
    else if (document.documentURI && (document.documentURI.indexOf("rsi.ch") >= 0))
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
        var idStr = "";

        // check if (right-) clicked on a link
        if (event.target && event.target.closest("a"))
        {
            // check if the "urn" data attribute is set, then we can easily extract the
            // media's ID from it
            var elemA = event.target.closest("a");
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
                if (idStr=="" && hrefAttr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/))
                {
                    idStr = hrefAttr;
                }
            }
        }
        else
        {
            // looks like it's the "new" way how this is represented on the srf.ch webpage (found it first in
            // September 2021). We might find the ID in one of the target's parent which has it encoded in the
            // "id" attribute or the .data.assetid entry.
            idStr = getIdWithIdAttr(event.target.parentNode);

            if (!idStr)
            {
                // ok, we didn't find the ID in one of the target's parents. We might be on a srf.ch/play/...
                // page and the user clicked the "main video element". If that's the case, let's apply some magic to
                // get the ID. It might be encoded in some element which is used to handle the player controls
                idStr = getIdWithPlayerCtrl(event.target);
            }
        }

        // if the string with the ID was set then we can forward this information (via a
        // message) to the background script which can then do the actual extraction of
        // the URLs
        browser.runtime.sendMessage({srfchId: idStr});
    }
}, true);

/*
    getIdWithIdAttr():
    Try to extract the ID from from any of the parents of "startingNode" by looking for an
    "id"-attribute.
*/
function getIdWithIdAttr(startingNode)
{
    // Let's try to find the ID in one of the node's parent which has it encoded in the 
    // "id" attribute or the .data.assetid entry.
    var idStr = "";
    var testNode = startingNode;
    for (let i=0; i<6; i++)
    {
        if (testNode.hasAttribute("id"))
        {
            var idAttr = testNode.getAttribute("id");
            var idMatch = idAttr.match(/player-wrapper__urn-srf-([a-z]+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
            if (idMatch)
            {
                idStr = "urn:srf:" + idMatch[1] + ":" + idMatch[2];
                break;
            }
        }

        if (testNode.dataset.assetid &&
            testNode.dataset.assetid.match(/urn:srf:[a-z]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/))
        {
            idStr = testNode.dataset.assetid;
            break;
        }

        if (testNode.parentNode)
        {
            // if it's not this element, it could be its parent where the information is available
            testNode = testNode.parentNode;
        }
        else
        {
            // no more climbing up the DOM tree
            break;
        }
    }

    return idStr;
}

/*
    getIdWithPlayerCtrl():
    Try to obtain the media ID by crawling up and down the DOM tree starting from some
    note "startingNode". The ID might be encoded in an <a ...> node's href attribute.
*/
function getIdWithPlayerCtrl(startingNode)
{
    var idStr = "";
    var parentNode = startingNode;
    for (let levelUp=0; levelUp<6 && !idStr; levelUp++)
    {
        idStr = getIdStrFromAHref(parentNode, 4, 0);

        if (parentNode.parentNode)
        {
            // if it's not this element, it could be its parent where the information is available
            parentNode = parentNode.parentNode;
        }
        else
        {
            // no more climbing up the DOM tree
            break;
        }
    }

    return idStr;
}

/*
    getIdStrFromAHref():
    Tries to extract the media ID from this node (if it's an <a ...> node and has a href
    attribute with the ID encoded). Otherwise recursively processes all the node's children.
*/
function getIdStrFromAHref(node, maxLevelDown, levelDown)
{
    var idStr = "";
    if (node.nodeName.toLowerCase()=="a")
    {
        // found an <a ...> node. Let's see if it contains in its href-attribute
        // the potential ID
        var hrefAttr = node.getAttribute("href");
        var idMatch = hrefAttr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        if (idMatch)
        {
            idStr = "urn:srf:video:" + idMatch[0];
        }
    }
    else
    {
        if (node.hasChildNodes())
        {
            levelDown++;
            let children = node.childNodes;
            for (let k=0; k < children.length && !idStr; k++)
            {
                idStr = getIdStrFromAHref(children[k], maxLevelDown, levelDown);
            }
        }
    }

    return idStr;
}

/*
    addRsiVideoBanner():
    Since on rsi.ch the videos are loaded in iframes from a different domain (not rsi.ch), we cannot
    handle the iframe properly. Therefore we need to add a banner to the webpage, right in front of
    the iframe...
*/
function addRsiVideoBanner(iframe, urn)
{
    // we should not add the same banner multiple times. To prevent so we add the div
    // an id with the number in the urn
    var bannerId = "";
    var urnDigitMatches = urn.match(/\d+/g);
    if (urnDigitMatches)
    {
        bannerId = "srfchaddonbanner";
        for (var k=0; k<urnDigitMatches.length; k++)
        {
            bannerId += urnDigitMatches[k];
        }
    }
    if (bannerId && document.getElementById(bannerId))
    {
        return;
    }

    var divIframe = iframe.parentNode;
    var nodeParent = divIframe.parentNode;

    // add the following HTML code to the current document's DOM tree:
    // <div style="text-align:center">
    //     <img class="srfchaddon" src="http://addons.cdn.mozilla.net/user-media/addon_icons/413/413748-64.png" />
    //       Download URLs for this video (right-click)
    //     <br/>
    //     <br/>
    // </div>
    var downloadImg = document.createElement("img");
    downloadImg.setAttribute("class", "srfchaddon");
    downloadImg.setAttribute("src", browser.runtime.getURL("images/rsich_64.png"));

    var downloadA   = document.createElement("a");
    downloadA.setAttribute("href", iframe.src);
    downloadA.dataset.urn = urn;

    // set text of link
    var downloadAtext = document.createTextNode(" " + browser.i18n.getMessage("bannerText"));
    downloadA.appendChild(downloadAtext);

    var downloadDiv = document.createElement("div");
    downloadDiv.setAttribute("style", "text-align:center");
    if (bannerId)
    {
        downloadDiv.setAttribute("id", bannerId);
    }
    downloadDiv.appendChild(downloadImg);
    downloadDiv.appendChild(downloadA);

    nodeParent.insertBefore(downloadDiv, divIframe);
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
            var content = "";
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

        if (nestedRowElement && (nestedRowElement.length > 0))
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
            downloadImg.setAttribute("src", browser.runtime.getURL("images/srfch_64.png"));

            var downloadA   = document.createElement("a");
            downloadA.setAttribute("href", document.documentURI);

            // set text of link
            var downloadAtext = document.createTextNode(" " + browser.i18n.getMessage("bannerText"));
            downloadA.appendChild(downloadAtext);

            var downloadDiv = document.createElement("div");
            downloadDiv.setAttribute("style", "text-align:center");
            downloadDiv.appendChild(downloadImg);
            downloadDiv.appendChild(downloadA);

            // (two) bracket returns
            downloadDiv.appendChild(document.createElement("br"));
            downloadDiv.appendChild(document.createElement("br"));

            var rowParent = nestedRowElement[0].parentElement;
            rowParent.insertBefore(downloadDiv, nestedRowElement[0]);
        }
    }
}