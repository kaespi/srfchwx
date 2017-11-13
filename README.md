SRF.ch
 ***
A Firefox extension to display the URLs of video- and audio-files on the Swiss national radio and television webpage (www.srf.ch), using the new WebExtensions format


This extension simply extracts the URLs of the video- and audio-files on the SRF (Schweizer Radio und Fernsehen, Swiss german national television and radio) and the RSI (Radiotelevisione Svizzera, Swiss italian national television and radio) webpage, www.srf.ch and www.rsi.ch respectively. After right-clicking on a video or audio link (or a banner which this extension sometimes adds to the pages) you can start extracting/grabbing the corresponding URLs by clicking on the context menu entry ("Extract SRF/RSI URLs"). If some URLs are then found an SRF/RSI icon will popup in the address bar of the browser. This one adds a dropdown menu from where you can copy the URLs by clicking on any of the dropdown entries.

Some of the content on the webpage is geo-blocked. This means that  the URLs can't be extracted. After some timeout the icon in the addressbar will appear as grayed-out icon. Other content is time blocked, meaning that the media file is only available over a fixed time-window. This is particularly the case for Tatort, Spielfilm and DOK videos.

Starting with version 1.1.5 the add-on extracts the URLs of the M3U playlists. These entries show up with their M3U description in the context menu rather than the RTMP URL like the other entries. They can be helpful because M3U playlists are often available even if the stream is geo- or time-blocked. Instructions on how to download these files is given further below.

Instruction on how to use the extracted URLs (with Open Source software, for links see below):
The media files can (only?) be transfered via the RTMP protocol. Flash players have it included, as well as the players on the web-page of SRF - of course. Nevertheless the files can be downloaded with the FLVstreamer software (see details below). Shell scripts for the download on Linux and Windows can found further below. Note that for videos which seem to be available as medium and low quality, i.e. "MQ" and "LQ", you could try to download the file in high quality as well. Just replace "mq1" or "lq1" in the URL by "hq1".

Media files for which M3U playlists are available can be directly played with VLC or any other player understanding the M3U format.

To download any streams/files avconv is very useful tool, using the following command

avconv -i <url> -codec copy <outputfile> (thanks to flip)


The downloaded files can be played with
 * Video:
   most (if not all!?) video files are of the format H264 with MPEG AAC audio. They can be viewed with the VLC player.
 * Audio:
   the audio files are of MPEG audio format (not mp3!). They can also be played with VLC.

Helpful software:
VLC player  - http://www.videolan.org/vlc
FLVstreamer - http://www.nongnu.org/flvstreamer
avconv - http://www.libav.org/avconv.html


Thanks to a hint from a user, the following command could be used to download an M3U file on Linux:
wget -qO - `wget -qO - <url>`

Or - as said above - using avconv:
 avconv -i <url> -codec copy <outputfile>

-Kaspar Giger <sftv@kgmw.ch>