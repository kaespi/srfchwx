
var popupTabId = null;

// listens for the mouse click on an entry of the popup
document.addEventListener("click", function(e) {
    if (e.target.classList.contains("media-select"))
    {
        var url = e.target.dataset.url;
        if (url)
        {
            // we need to select the text somehow. To do so we quickly add a textarea element
            // to the DOM tree, fill it with the URL, select its text and copy this one:
            //  1. create the textarea element
            var textarea = window.document.createElement("textarea");
            textarea.className = "url-txt"; // class 'url-txt' will make it of height 1px (such that it won't be noticeable)
            var txtUrl = window.document.createTextNode(url);
            //  2. fill the textarea with the URL
            textarea.appendChild(txtUrl);
            window.document.body.appendChild(textarea);

            //  3. select the textarea's contents (i.e. the URL)
            textarea.select();
            //  4. copy the selected text to clipboard
            document.execCommand("Copy");

            //  5. delete the textarea again
            textarea.parentNode.removeChild(textarea);

            window.close();
            return;
        }
    }
});

/*
    onGotBg(page):
    Function called after the popup is opened and a background page is available. This
    function basically gets the URLs the background page has extracted and shapes the
    entries of the popup
*/
function onGotBg(page)
{
    // only add some elements to the popup if URLs are available...
    if (page.media[popupTabId].length > 0)
    {
        var title = page.mediaTitle[popupTabId];
        if (!title)
        {
            title = "untitled: (click to copy URL)";
        }
        var divTitle = window.document.createElement("div");
        divTitle.className = "media-title";
        var txtTitle = window.document.createTextNode(page.mediaTitle[popupTabId]+": (click to copy URL)");
        divTitle.appendChild(txtTitle);
        window.document.body.appendChild(divTitle);

        for (var k=0; k<page.media[popupTabId].length; k++)
        {
            var div = window.document.createElement("div");
            div.className = "media-select";
            div.dataset.url = page.media[popupTabId][k].url;
            var desc = page.media[popupTabId][k].desc;
            // prevent oversized descriptions...
            if (desc.length > 90)
            {
                desc = desc.substr(0,70) + "....." + desc.substr(-19);
            }
            var txt = window.document.createTextNode(desc);
            div.appendChild(txt);
            window.document.body.appendChild(div);
        }
    }
}

/*
    onBgError(page):
    Function called after the popup is opened and the background page is not available.
*/
function onBgError(error)
{
    console.log("[srfch] error getting bg page");
}

// the code from here on is executed when the popup is opened (i.e. the user clicks the icon)

// clear the existing nodes: title...
var divs = window.document.getElementsByClassName("media-title");
while (divs[0])
{
    divs[0].parentNode.removeChild(divs[0]);
}

// ... and selectors
var divs = window.document.getElementsByClassName("media-select");
while (divs[0])
{
    divs[0].parentNode.removeChild(divs[0]);
}

// query the current active tab ID. Without knowing it we cannot continue
// here because the background page stores information for each tab individually
var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
gettingActiveTab.then((tabs) => {
    popupTabId = tabs[0].id;

    var getting = browser.runtime.getBackgroundPage();
    getting.then(onGotBg, onBgError);
});
