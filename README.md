![SRF.ch build status](https://github.com/kaespi/srfchwx/actions/workflows/srfchwx_ci.yml/badge.svg) ![GitHub](https://img.shields.io/github/license/kaespi/srfchwx) ![GitHub tag (latest by date)](https://img.shields.io/github/v/tag/kaespi/srfchwx)


# SRF.ch Firefox extension

This is a Firefox extension to obtain the URLs of video- and audio-files on the Swiss national radio and television webpage (www.srf.ch), using the new WebExtensions format.

The extension is published in the official Firefox Add-Ons store, but in the non-checked part: https://addons.mozilla.org/en-US/firefox/addon/srfch/.

## How it's done

This a short description of how the media URLs are derived.

### Step 1: get the media's unique ID

Each video/audio has its own unique ID. The ID follows the regex `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`, e.g. 9f755253-7ccd-40f9-81a9-15f6b73dd4c7. The task of the browser extension is to find this ID in the page's DOM tree starting from the element which was right-clicked. Naturally, the page's look changes every now and then, hence there are various ways to obtain the ID and they need to be updated sometimes.

### Step 2: get the media's different streams

Once the ID was obtained, the different streams for the video/audio can be found in a JSON file from srgssr.ch server. Namely the JSON file can be found
 * for srf.ch videos: `https://il.srgssr.ch/integrationlayer/2.0/mediaComposition/byUrn/urn:srf:video:<ID>.json`;
 * for srf.ch audios: `https://il.srgssr.ch/integrationlayer/2.0/srf/mediaComposition/audio/<ID>.json`
 * for rsi.ch stuff: `http://il.srgssr.ch/integrationlayer/1.0/ue/rsi/video/play/<ID>.json`

Replace the `<ID>` above by the media's unique ID as obtained in step 1.

The JSON file contains a lot of meta information about the media, such as the title, the time it was broadcast, a short description etc., see an example below
<details>
    <summary>show example JSON file excerpts</summary>

```
{
  "Video": {
    "id": "9f755253-7ccd-40f9-81a9-15f6b73dd4c7",
    "modifiedDate": "2021-11-29T08:51:14+01:00",
    "urn": "urn:srf:ais:video:9f755253-7ccd-40f9-81a9-15f6b73dd4c7",
    "displayable": true,
    "createdDate": "2021-11-26T11:17:06+01:00",
    "assetSetId": "9ac55409-7209-43de-8d9c-03cea6b2ed42",
    "position": 0,
    "assetSubSetId": "EPISODE",
    "validFrom": "2021-11-28T22:20:00+01:00",
    "validTo": "2022-05-27T23:59:00+02:00",
    "noEmbed": true,
    "AssetMetadatas": {
      "AssetMetadata": [
        {
          "id": "aea188a1-2b5b-4a55-92db-b90a45c91c5a",
          "modifiedDate": "2021-11-29T08:51:14+01:00",
          "createdDate": "2021-11-26T11:17:06+01:00",
          "description": "Auf dem Simplon kommt es zu einer [...]",
          "lead": "Eine Konfrontation auf dem [...]",
          "title": "Tomatsossu",
          "assetId": "9f755253-7ccd-40f9-81a9-15f6b73dd4c7",
          "usage": "DEFAULT"
        }
      ]
    },
    ...
    ...
    "Playlists": {
      "@availability": "ONDEMAND",
      "Playlist": [
       ...
       ...
        {
          "@segmentation": "LOGICAL",
          "@protocol": "HTTP-HLS",
          "url": [
            {
              "@quality": "SD",
              "text": "https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,.mp4.csmil/master.m3u8"
            },
            {
              "@quality": "HD",
              "text": "https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/master.m3u8"
            }
          ]
        }
      ]
...
...
```
</details>

In this JSON file we can find the playlist file for the media, the `master.m3u8`. This leads us to the third step.

### Step 3: extract the different streams from master.m3u8

The playlist file (`master.m3u8`) is then downloaded and parsed. It's a plain ASCII file. It contains addresses of the streams in various qualities. See the example below:

```
#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1327000,RESOLUTION=640x360,CODECS="avc1.77.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_0_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=148000,RESOLUTION=320x180,CODECS="avc1.66.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_1_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=348000,RESOLUTION=480x272,CODECS="avc1.66.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_2_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=695000,RESOLUTION=512x288,CODECS="avc1.77.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_3_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2127000,RESOLUTION=960x544,CODECS="avc1.77.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_4_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=3627000,RESOLUTION=1280x720,CODECS="avc1.77.30, mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_5_av.m3u8?null=0
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=48000,CODECS="mp4a.40.2",CLOSED-CAPTIONS=NONE
https://srfvodhd-vh.akamaihd.net/i/vod/tschugger/2021/11/tschugger_20211125_135500_7372782_v_webcast_h264_,q40,q10,q20,q30,q50,q60,.mp4.csmil/index_1_a.m3u8?null=0

```

In this last step this file is parsed, the meta information (such as bandwidth, resolution etc.) is available from the lines starting with `#`. This is then presented to the user which can then find for different qualities the actual URLs to play/download the video or audio stream.

## How it works in Firefox

This extension simply extracts the URLs of the video- and audio-files on the SRF (Schweizer Radio und Fernsehen, Swiss german national television and radio) and the RSI (Radiotelevisione Svizzera, Swiss italian national television and radio) webpage, www.srf.ch and www.rsi.ch respectively. After right-clicking on a video or audio link (or a banner which this extension sometimes adds to the pages) you can start extracting/grabbing the corresponding URLs by clicking on the context menu entry ("Extract SRF/RSI URLs"). If some URLs are then found an SRF/RSI icon will popup in the address bar of the browser. This one adds a dropdown menu from where you can copy the URLs by clicking on any of the dropdown entries.

Some of the content on the webpage is geo-blocked. This means that  the URLs can't be extracted. After some timeout the icon in the addressbar will appear as grayed-out icon. Other content is time blocked, meaning that the media file is only available over a fixed time-window. This is particularly the case for Tatort, Spielfilm and DOK videos.

Starting with version 1.1.5 the add-on extracts the URLs of the M3U playlists. These entries show up with their M3U description in the context menu rather than the RTMP URL like the other entries. They can be helpful because M3U playlists are often available even if the stream is geo- or time-blocked. Instructions on how to download these files is given further below.

## How to use the extracted URLs

The media files can (only?) be easily downloaded using open source tools. Media files for which M3U playlists are available can be directly played with VLC or any other player understanding the M3U format. Others, like those with RTMP probably need special software such as FLVstreamer.

To download any streams/files ffmpeg is very useful tool, using the following command (kudos to [flip](https://oinkzwurgl.org/))

    ffmpeg -i <url> -codec copy <outputfile>


The downloaded files can be played with
 * Video:
   most (if not all!?) video files are of the format H264 with MPEG AAC audio. They can be viewed with the VLC player.
 * Audio:
   the audio files are of MPEG audio format (not mp3!). They can also be played with VLC.

Helpful software:
 * [VLC player](http://www.videolan.org/vlc)
 * [FLVstreamer](http://www.nongnu.org/flvstreamer)
 * [FFmpeg](http://www.ffmpeg.org/)


Thanks to a hint from a user, the following command could be used to download an M3U file on Linux:

    wget -qO - `wget -qO - <url>`

Or - as said above - using ffmpeg:

    ffmpeg -i <url> -codec copy <outputfile>

-Kaspar Giger <sftv@kgmw.ch>
