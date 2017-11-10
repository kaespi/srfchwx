document.addEventListener("click", function(e) {
    if (e.target.classList.contains("media-select"))
    {
        var url = e.target.dataset.url;
        if (url)
        {
            url.select();
            document.execCommand("Copy");
            window.close();
            return;
        }
    }
});


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

function onGotBg(page)
{
    console.log("got bg page");
    console.log("urlText="+page.urlText);
    
    var title = page.mediaTitle;
    if (!title)
    {
        title = "untitled: (click to copy URL)";
    }
    var b = window.document.createElement("b");
    b.className = "media-title";
    var txtTitle = window.document.createTextNode(page.mediaTitle+": (click to copy URL)");
    b.appendChild(txtTitle);
    window.document.body.appendChild(b);
    
    for (var k=0; k<page.media.length; k++)
    {
        var div = window.document.createElement("div");
        div.className = "media-select";
        div.dataset.url = page.media[k].url;
        var txt = window.document.createTextNode(page.media[k].desc);
        div.appendChild(txt);
        window.document.body.appendChild(div);
    }
}

function onBgError(error)
{
    console.log("error getting bg page");
}

var getting = browser.runtime.getBackgroundPage();
getting.then(onGotBg, onBgError);