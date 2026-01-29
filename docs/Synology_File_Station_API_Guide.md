## **Official API**

THIS DOCUMENT CONTAINS PROPRIETARY TECHNICAL INFORMATION WHICH IS
THE PROPERTY OF SYNOLOGY INCORPORATED AND SHALL NOT BE
REPRODUCED, COPIED, OR USED AS THE BASIS FOR DESIGN, MANUFACTURING,
OR SALE OF APPARATUS WITHOUT WRITTEN PERMISSION OF SYNOLOGY
INCORPORATED


## ~~**Table of Contents**~~

Chapter 1: Introduction


Chpater 2: Getting Started


API Workflow


Making Requests


Parsing Response


Common Error Codes


Working Example


Chpater 3: Base API


SYNO.API.Info


SYNO.API.Auth


Chpater 4: File Station API


SYNO.FileStation.Info


SYNO.FileStation.List


SYNO.FileStation.Search


SYNO.FileStation.VirtualFolder


SYNO.FileStation.Favorite


SYNO.FileStation.Thumb


SYNO.FileStation.DirSize


SYNO.FileStation.MD5


SYNO.FileStation.CheckPermission


SYNO.FileStation.Upload


SYNO.FileStation.Download


SYNO.FileStation.Sharing


SYNO.FileStation.CreateFolder


SYNO.FileStation.Rename


SYNO.FileStation.CopyMove


SYNO.FileStation.Delete


SYNO.FileStation.Extract


SYNO.FileStation.Compress


SYNO.FileStation.BackgroundTask


Appendix A: Release Notes



**Synology File Station Official API**


1.1


1.2


1.2.1


1.2.2


1.2.3


1.2.4


1.2.5


1.3


1.3.1


1.3.2


1.4


1.4.1


1.4.2


1.4.3


1.4.4


1.4.5


1.4.6


1.4.7


1.4.8


1.4.9


1.4.10


1.4.11


1.4.12


1.4.13


1.4.14


1.4.15


1.4.16


1.4.17


1.4.18


1.4.19


1.5



1 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Chapter 1: Introduction**~~


This File Station Official API developer's guide explains how to expand your applications based on the APIs of

File Station, allowing your applications to interact with files in DSM via HTTP/HTTPS requests and responses.


This document explains the structure and detailed specifications of various File Station APIs. "Chapter 2: Get

Started" describes the basic guidelines on how to use these APIs, which we suggest reading all the way through

before you jump into the API specifications. "Chapter 3: Base API" and "Chapter 4: File Station API" list all

available APIs and related details.


THIS DOCUMENT CONTAINS PROPRIETARY TECHNICAL INFORMATION WHICH IS THE PROPERTY OF

SYNOLOGY INCORPORATED AND SHALL NOT BE REPRODUCED, COPIED, OR USED AS THE BASIS

FOR DESIGN, MANUFACTURING, OR SALE OF APPARATUS WITHOUT WRITTEN PERMISSION OF

SYNOLOGY INCORPORATED

### **Copyright**



Synology Inc. ® 2023 Synology Inc.



All rights reserved.



No part of this publication may be reproduced, stored in a retrieval system, or transmitted, in any form or by any

means, mechanical, electronic, photocopying, recording, or otherwise, without prior written permission of

Synology Inc., with the following exceptions: Any person is hereby authorized to store documentation on a single

computer for personal use only and to print copies of documentation for personal use provided that the

documentation contains Synology's copyright notice.


The Synology logo is a trademark of Synology Inc.


No licenses, express or implied, are granted with respect to any of the technology described in this document.

Synology retains all intellectual property rights associated with the technology described in this document. This

document is intended to assist application developers to develop applications only for Synology-labeled

computers.


Every effort has been made to ensure that the information in this document is accurate. Synology is not

responsible for typographical errors.


Synology Inc. 9F., No.1, Yuandong Rd., New Taipei City 220632, Taiwan


Synology and the Synology logo are trademarks of Synology Inc., registered in the United States and other

countries.


Marvell is registered trademarks of Marvell Semiconductor, Inc. or its subsidiaries in the United States and other

countries.


Freescale is registered trademarks of Freescale. Intel and Atom is registered trademarks of Intel.


Semiconductor, Inc. or its subsidiaries in the United States and other countries.


Other products and company names mentioned herein are trademarks of their respective holders.


2 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


Even though Synology has reviewed this document, SYNOLOGY MAKES NO WARRANTY OR

~~REPRESENTATION, EITHER EXPRESS OR IMPLIED, WITH RESPECT TO THIS DOCUMENT, ITS QUALITY,~~

ACCURACY, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. AS A RESULT, THIS

DOCUMENT IS PROVIDED “AS IS,” AND YOU, THE READER, ARE ASSUMING THE ENTIRE RISK AS TO

ITS QUALITY AND ACCURACY. IN NO EVENT WILL SYNOLOGY BE LIABLE FOR DIRECT, INDIRECT,

SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES RESULTING FROM ANY DEFECT OR

INACCURACY IN THIS DOCUMENT, even if advised of the possibility of such damages.


THE WARRANTY AND REMEDIES SET FORTH ABOVE ARE EXCLUSIVE AND IN LIEU OF ALL OTHERS,

ORAL OR WRITTEN, EXPRESS OR IMPLIED. No Synology dealer, agent, or employee is authorized to make

any modification, extension, or addition to this warranty.


Some states do not allow the exclusion or limitation of implied warranties or liability for incidental or

consequential damages, so the above limitation or exclusion may not apply to you. This warranty gives you

specific legal rights, and you may also have other rights which vary from state to state.


3 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Chpater 2: Getting Started**~~


Before making use of File Station APIs to develop your own applications, you need to have basic understanding

of API concepts and API procedures.


This chapter explains how to execute and complete API processes in the following five sections:


**API Workflow** : Briefly introduces how to work with File Station APIs

**Making Requests** : Elaborates on how to construct API requests

**Parsing Response** : Describes how to parse response data

**Common Error Codes** : Lists all common error codes that might be returned from all File Station APIs

**Working Example** : Provides an example to request a file operation


4 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**API Workflow**~~


The following five-step and easy-to-follow workflow shows how to make your application interact with File Station

APIs.

##### **Step 1: Retrieve API Information**


First, your application needs to retrieve API information from the target DiskStation to know which APIs are

available for use on the target DiskStation. This information can be accessed simply through a request to

`/webapi/query.cgi` with SYNO.API.Info API parameters. The information provided in the response contains

available API name, API method, API path and API version. Once you have all the information on hand, your

application can make further requests to all available APIs.

##### **Step 2: Log in**


5 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


In order to make your application interact with File Station, your application needs to log in with an account and

~~password first. The login process is simply making a request to SYNO.API.Auth API with the~~ ~~`login`~~ ~~method. If~~

successful, the API returns an authorized session ID. You should keep it and pass it on making other API

requests.

##### **Step 3: Making API Requests**


Once successfully logged in, your application can start to make requests to all available File Station APIs. In the

next section, "Making Requests", instructions on how to form a valid API request and how to decode response

information will be given.

##### **Step 4: Log out**


After finishing the steps above, your application can end the login session by making another request to

SYNO.API.Auth API with the `logout` method.


6 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Making Requests**~~


There are five basic elements that are used to construct a valid request to any API.


**API name** : Name of the API requested

**version** : Version of the API requested

**path** : path of the API. The path information can be retrieved by requesting SYNO.API.Info

**method** : Method of the API requested

**_sid** : Authorized session ID. Each API request should pass it, which is retrieved from the response of

`/webapi/auth.cgi`, via either HTTP/HTTPS GET/POST method with `_sid` argument. Otherwise, if you pass

it within `id` value of cookie of HTTP/HTTPS header, this parameter can be ignored.


And the syntax for the request is as follows:





Here `<PARAMS>` represents the parameters for the requested method which is optional. Note all parameters need

to be escaped. Commas "," are replaced by slashes "\", and slashes "\" are replaced by double-slashes "\\",

because commas "," are used to separate multiple elements in a parameter. Password-relative parameters do

not need to be escaped including passwd or password parameter.


Please see the following example. If you want to make a request to the SYNO.API.Info API version 1 with the

`query` method on your DiskStation whose address is http://myds.com:port (default ports for HTTP and HTTPS

are 5000 or 5001, respectively) for the list of all available API methods, the corresponding parameters are:


**API name** : SYNO.API.Info

**version** : 1

**path** : query.cgi

**method** : query

**params** : query=all


And the request will look like this:





Note that an API's path and supported version information can be acquired by sending a request to

SYNO.API.Info. The location of SYNO.API.Info is fixed so that you can always request SYNO.API.Info with

`/webapi/query.cgi` .


7 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Parsing Response**~~


All API responses are encoded in the JSON format, and the JSON response contains elements as follows:






|Key|Value|Description|
|---|---|---|
|`success`|true/false|"**true**": the request finishes successfully; "**false**": the request fails with an<br>error data.|
|`data`|` <JSON-Style`<br>`Object>`|The data object contains all response information described in each<br>method.|
|`error`|` <JSON-Style`<br>`Object>`|The data object contains error information when a request fails. The basic<br>elements are described in the next table.|



The following describes the format of error information in error element.







|Key|Value|Description|
|---|---|---|
|`code`|Error<br>Code|An error code will be returned when a request fails. There are two kinds of error<br>codes: a common error code which is shared between all APIs; the other is a<br>specific API error code (described under the corresponding API spec).|
|`errors`|` <JSON-`<br>`Style`<br>`Array>`|The array contains detailed error information of each file. Each element within<br>errors is a JSON-Style Object which contains an error code and other information,<br>such as a file path or name.<br>Note: When there is no detailed information, this error element will not respond.|

##### **Example 1**





Respond an invalid request to get information of File Station without a method parameter.


**Request:**





**Failed Response:**


##### **Example 2**

Respond an invalid request with an illegal path to create a folder.


**Request:**





8 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



**Failed Response:**




##### **Example 3**

Respond a successful request to get information from File Station.


**Request:**





**Success Response:**











Note that to demonstrate examples with clarity, only the data object is included in the response examples given in

the following sections.


9 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Common Error Codes**~~


The codes listed below are common error codes of wrong parameters or failed login for all WebAPIs.

|Code|Description|
|---|---|
|`100`|Unknown error|
|`101`|No parameter of API, method or version|
|`102`|The requested API does not exist|
|`103`|The requested method does not exist|
|`104`|The requested version does not support the functionality|
|`105`|The logged in session does not have permission|
|`106`|Session timeout|
|`107`|Session interrupted by duplicate login|
|`119`|SID not found|



The codes listed below are common error codes of file operations for all File Station APIs.


10 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Code|Description|
|---|---|
|`400`|Invalid parameter of file operation|
|`401`|Unknown error of file operation|
|`402`|System is too busy|
|`403`|Invalid user does this file operation|
|`404`|Invalid group does this file operation|
|`405`|Invalid user and group does this file operation|
|`406`|Can't get user/group information from the account server|
|`407`|Operation not permitted|
|`408`|No such file or directory|
|`409`|Non-supported file system|
|`410`|Failed to connect internet-based file system (e.g., CIFS)|
|`411`|Read-only file system|
|`412`|Filename too long in the non-encrypted file system|
|`413`|Filename too long in the encrypted file system|
|`414`|File already exists|
|`415`|Disk quota exceeded|
|`416`|No space left on device|
|`417`|Input/output error|
|`418`|Illegal name or path|
|`419`|Illegal file name|
|`420`|Illegal file name on FAT file system|
|`421`|Device or resource busy|
|`599`|No such task of the file operation|



11 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Working Example**~~


The following demonstrates a working example for requesting a file operation from the DiskStation. To implement

this example, simply replace the DiskStation address used in the example (myds.com:port) with your DiskStation

address and paste the URL to a browser. Then the JSON response will show up in a response page.

##### **Step 1: Retrieve API Information**


In order to make API requests, you should first request to `/webapi/query.cgi` with SYNO.API.Info to get the

SYNO.API.Auth API information for logging in and FileStation API info for file operations.


**Request:**





**Response:**




##### **Step 2: Login**

After the SYNO.API.Auth path and supported version information are returned, you can log in a FileStation

session by requesting SYNO.API.Auth API version 3 located at `/webapi/auth.cgi` .


**Request:**





**Response:**





12 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **Step 3: Request a File Station API**


After a session is logged in, you can continue to call the method of listing shared folder in SYNO.FileStation.List.

The cgi path and version are provided in the response of Step 1, and the list of all tasks can be requested by

excluding the `offset` and `limit` parameters.


**Request:**





**Response:**





From the response list, it can be observed that there are two shared folders in File Station. Let's say you're

interested in the shared folder "photo" and want to know more details about it, you can make another request to

the `getinfo` method. In this request, you will need to add the parameter `additional=real_path,owner,time` for

the method to request detailed objects and transfer them in response.


**Request:**





**Response:**


13 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**






##### **Step 4: Logout**

When finished with the procedure, you should log out of the current session. The session will be ended by calling

the `logout` method in SYNO.API.Auth. If you want to log out a specific session, you can pass the `_sid`

parameter.


**Example:**





14 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Chpater 3: Base API**~~

##### **API List**


The following table is the overview of two fundamental APIs defined in this chapter:

|API Name|Description|
|---|---|
|`SYNO.API.Info`|Provide available API info.|
|`SYNO.API.Auth`|Perform login and logout.|



15 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.API.Info**~~

##### **_Overview_**


Availability: Since DSM 4.0


Version: 1

##### **_Method_** **Query**


**Request:**

|Parameter|Description|Availability|
|---|---|---|
|`query`|API names, separated by a comma "," or use "all" to get all supported<br>APIs.|1 and later|



**Example:**





**Response:**


Contains API description objects.

|Parameter|Description|Availability|
|---|---|---|
|`key`|API name.|1 and later|
|`path`|API path.|1 and later|
|`minVersion`|Minimum supported API version.|1 and later|
|`maxVersion`|Maximum supported API version.|1 and later|



**Example:**





16 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **_API Error Code_**


No specific API error codes.


17 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.API.Auth**~~

##### **_Overview_**


Availability: Since DSM 4.0


Version: 3 (Since DSM 4.2), 2 (Since DSM 4.1)

##### **_Method_** **Login**


**Request:**








|Parameter|Description|Availability|
|---|---|---|
|`account`|Login account name.|1 and later|
|`passwd`|Login account password.|1 and later|
|`session`|Login session name.|1 and later|
|`format`|Returned format of session ID. The following are the two possible options<br>and the default value is` cookie`. <br>` cookie`: The login session ID will be set to "id" key in cookie of<br>HTTP/HTTPS header of response.<br>` sid`: The login sid will only be returned as response JSON data and "id"<br>key will not be set in cookie.|2 and later|
|`otp_code`|Reserved key. DSM 4.2 and later support a 2-step verification option with<br>an OTP code. If it's enabled, the user is required to enter a verification<br>code to log in to DSM sessions. However, WebAPI doesn't support it yet.|3 and later|



**Note** : The applied sid will expire after _7 days_ by default.


**Example:**





**Response:**



|Parameter|Description|Availability|
|---|---|---|
|`sid`|Authorized session ID. When the user log in with` format=sid`, cookie will<br>not be set and each API request should provide a request parameter<br>` _sid=<sid>` along with other parameters.|2 and later|


**Example:**









18 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **Logout**


**Request:**

|Parameter|Description|Availability|
|---|---|---|
|`session`|Session name to be logged out.|1 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**

|Code|Description|
|---|---|
|`400`|No such account or incorrect password|
|`401`|Account disabled|
|`402`|Permission denied|
|`403`|2-step verification code required|
|`404`|Failed to authenticate 2-step verification code|



19 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**Chpater 4: File Station API**~~

### **API List**


The following table is the overview of all File Station APIs defined in this chapter. All File Station APIs are

required to login with SYNO.API.Auth and session=FileStation.






|API Name|Description|
|---|---|
|`SYNO.FileStation.Info`|Provide File Station info.|
|`SYNO.FileStation.List`|List all shared folders, enumerate files in a shared folder,<br>and get detailed file information.|
|`SYNO.FileStation.Search`|Search files on given criteria.|
|`SYNO.FileStation.VirtualFolder`|List all mount point folders of virtual file system, e.g., CIFS<br>or ISO.|
|`SYNO.FileStation.Favorite`|Add a folder to user's favorites or perform operations on<br>user's favorites.|
|`SYNO.FileStation.Thumb`|Get a thumbnail of a file.|
|`SYNO.FileStation.DirSize`|Get the total size of files/folders within folder(s).|
|`SYNO.FileStation.MD5`|Get MD5 of a file.|
|`SYNO.FileStation.CheckPermission`|Check if the file/folder has permission of a file/folder or not.|
|`SYNO.FileStation.Upload`|Upload a file.|
|`SYNO.FileStation.Download`|Download files/folders.|
|`SYNO.FileStation.Sharing`|Generate a sharing link to share files/folders with other<br>people and perform operations on sharing links.|
|`SYNO.FileStation.CreateFolder`|Create folder(s).|
|`SYNO.FileStation.Rename`|Rename a file/folder.|
|`SYNO.FileStation.CopyMove`|Copy/Move files/folders.|
|`SYNO.FileStation.Delete`|Delete files/folders.|
|`SYNO.FileStation.Extract`|Extract an archive and perform operations on an archive.|
|`SYNO.FileStation.Compress`|Compress files/folders.|
|`SYNO.FileStation.BackgroundTask`|Get information regarding tasks of file operations which are<br>run as the background process including copy, move,<br>delete, compress and extract tasks or perform operations<br>on these background tasks.|



20 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


## ~~**SYNO.FileStation.Info**~~

##### **_Description_**

Provide File Station information.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **get**


**Description:**


Provide File Station information.


**Request:**


No parameters are required.


**Example:**





**Response:**


`<data>` object definitions:









|Parameter|Type|Description|Availability|
|---|---|---|---|
|`is_manager`|Boolean|If the logged-in user is an administrator.|2 and later|
|`support_virtual_protocol`|String|Types of virtual file system which the<br>logged user is able to mount on. DSM<br>6.0 supports CIFS, NFS and ISO of<br>virtual file system. Different types are<br>separated with a comma, for example:<br>cifs,nfs,iso.|2 and later|
|`support_sharing`|Boolean|If the logged-in user can sharing file(s) /<br>folder(s) or not.|2 and later|
|`hostname`|String|DSM host name.|2 and later|


**Example:**


21 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**






##### **_API Error Code_**

No specific API error codes.


22 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.List**~~

##### **_Description_**


List all shared folders, enumerate files in a shared folder, and get detailed file information.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **list_share**


**Description:**


List all shared folders.


**Availability:**


Since version 2.


**Request:**


23 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**














|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`offset`|Optional. Specify how many<br>shared folders are skipped<br>before beginning to return<br>listed shared folders.|Integer|0|2 and later|
|`limit`|Optional. Number of shared<br>folders requested. 0 lists all<br>shared folders.|Integer|0|2 and later|
|`sort_by`|Optional. Specify which file<br>information to sort on.<br>Options include:<br>**name**: file name.<br>**user**: file owner.<br>**group**: file group.<br>**mtime**: last modified time.<br>**atime**: last access time.<br>**ctime**: last change time.<br>**crtime**: create time.<br>**posix**: POSIX permission.|name, user,<br>group, mtime,<br>atime, ctime,<br>crtime or posix|name|2 and later|
|`sort_direction`|Optional. Specify to sort<br>ascending or to sort<br>descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|2 and later|
|`onlywritable`|Optional.<br>` true`: List writable shared<br>folders.<br>` false`: List writable and<br>read-only shared folders.|true or false|false|2 and later|




**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`additional`|Optional. Additional requested<br>file information separated by a<br>comma "," and around the<br>brackets. When an additional<br>option is requested,<br>responded objects will be<br>provided in the specified<br>additional option.<br>Options include:<br>**real_path**: return a real<br>path in volume.<br>**size**: return file byte size.<br>**owner**: return information<br>about file owner including<br>user name, group name,<br>UID and GID.<br>**time**: return information<br>about time including last<br>access time, last<br>modified time, last<br>change time and create<br>time.<br>**perm**: return information<br>about file permission.<br>**mount_point_type**:<br>return a type of a virtual<br>file system of a mount<br>point.<br>**volume_status**: return<br>volume statuses<br>including free space, total<br>space and read-only<br>status.|real_path, owner,<br>time, perm,<br>mount_point_type,<br>sync_share, or<br>volume_status|(None)|2 and later|


**Example:**











**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of shared folders.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`shares`|` <JSON-Style Array>`|Array of` <shared folder>` objects.|2 and later|



`<shared folder>` object definition:


25 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`path`|String|Path of a shared folder.|2 and later|
|`name`|String|Name of a shared folder.|2 and later|
|`additional`|` <shared-folder additional>` object|Shared-folder additional object.|2 and later|



`<shared-folder additional>` object definition:

















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`real_path`|String|Real path of a shared folder in a volume<br>space.|2 and later|
|`owner`|` <owner>` object|File owner information including user<br>name, group name, UID and GID.|2 and later|
|`time`|` <time>` object|Time information of file including last<br>access time, last modified time, last<br>change time, and creation time.|2 and later|
|`perm`|` <shared-folder`<br>`perm>` object|File permission information.|2 and later|
|`mount_point_type`|String|Type of a virtual file system of a mount<br>point.|2 and later|
|`volume_status`|` <volume_status>`<br>object|Volume status including free space, total<br>space and read-only status.|2 and later|


`<owner>` object definition:





|Parameter|Type|Description|Availability|
|---|---|---|---|
|`user`|String|User name of file owner.|2 and later|
|`group`|String|Group name of file group.|2 and later|
|`uid`|Integer|File UID.|2 and later|
|`gid`|Integer|File GID.|2 and later|


`<time>` object definition:







|Parameter|Type|Description|Availability|
|---|---|---|---|
|`atime`|Linux timestamp in<br>second|Linux timestamp of last access in second.|2 and later|
|`mtime`|Linux timestamp in<br>second|Linux timestamp of last modification in<br>second.|2 and later|
|`ctime`|Linux timestamp in<br>second|Linux timestamp of last change in second.|2 and later|
|`crtime`|Linux timestamp in<br>second|Linux timestamp of create time in second.|2 and later|


Note: Linux timestamp in second, defined as the number of seconds that have elapsed since 00:00:00

Coordinated Universal Time (UTC), Thursday, 1 January 1970.


`<shared-folder perm>` object definition:


26 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**
























|Parameter|Type|Description|Availability|
|---|---|---|---|
|`share_right`|String|"RW": The shared folder is writable; "RO": the<br>shared folder is read-only.|2 and later|
|`posix`|Integer|POSIX file permission, For example, 777 means<br>owner, group or other has all permission; 764<br>means owner has all permission, group has<br>read/write permission, other has read permission.|2 and later|
|`adv_right`|` <adv_right>`<br>object|Special privilege of the shared folder.|2 and later|
|`acl_enable`|Boolean|If Windows ACL privilege of the shared folder is<br>enabled or not.|2 and later|
|`is_acl_mode`|Boolean|` true`: The privilege of the shared folder is set to be<br>ACL-mode.` false`: The privilege of the shared<br>folder is set to be POSIX-mode.|2 and later|
|`acl`|` <acl>`<br>object|Windows ACL privilege. If a shared folder is set to<br>be POSIX-mode, these values of Windows ACL<br>privileges are derived from the POSIX privilege.|2 and later|



`<adv_right>` object definition:









|Parameter|Type|Description|Availability|
|---|---|---|---|
|`disable_download`|Boolean|If a non-administrator user can download files in<br>this shared folder through<br>SYNO.FileStation.Download API or not.|2 and later|
|`disable_list`|Boolean|If a non-administrator user can enumerate files in<br>this shared folder though SYNO.FileStation.List<br>API with list method or not.|2 and later|
|`disable_modify`|Boolean|If a non-administrator user can modify or overwrite<br>files in this shared folder or not.|2 and later|


`<acl>` object definition:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`append`|Boolean|If a logged-in user has a privilege to append data or create<br>folders within this folder or not.|2 and later|
|`del`|Boolean|If a logged-in user has a privilege to delete a file/a folder<br>within this folder or not.|2 and later|
|`exec`|Boolean|If a logged-in user has a privilege to execute files/traverse<br>folders within this folder or not.|2 and later|
|`read`|Boolean|If a logged-in user has a privilege to read data or list folder<br>within this folder or not.|2 and later|
|`write`|Boolean|If a logged-in user has a privilege to write data or create files<br>within this folder or not.|2 and later|



`<volume_status>` object definition:


27 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`freespace`|Integer|Byte size of free space of a volume where a shared folder<br>is located.|2 and later|
|`totalspace`|Integer|Byte size of total space of a volume where a shared folder<br>is located.|2 and later|
|`readonly`|Boolean|` true`: A volume where a shared folder is located is read-<br>only;` false`: It's writable.|2 and later|



**Example:**




##### **list**

28 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Description:**


Enumerate files in a given folder.


**Availability:**


Since version 2.


**Request:**


29 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**














|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`folder_path`|A listed folder path starting<br>with a shared folder.|String|(None)|2 and later|
|`offset`|Optional. Specify how many<br>files are skipped before<br>beginning to return listed files.|Integer|0|2 and later|
|`limit`|Optional. Number of files<br>requested. 0 indicates to list<br>all files with a given folder.|Integer|0|2 and later|
|`sort_by`|Optional. Specify which file<br>information to sort on.<br>Options include:<br>**name**: file name.<br>**size**: file size.<br>**user**: file owner.<br>**group**: file group.<br>**mtime**: last modified time.<br>**atime**: last access time.<br>**ctime**: last change time.<br>**crtime**: create time.<br>_posix_: POSIX permission.<br>**type**: file extension.|name, size, user,<br>group, mtime,<br>atime, ctime,<br>crtime, posix or<br>type|name|2 and later|
|`sort_direction`|Optional. Specify to sort<br>ascending or to sort<br>descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|2 and later|
|`pattern`|Optional. Given glob pattern(s)<br>to find files whose names and<br>extensions match a case-<br>insensitive glob pattern.<br>Note:<br>1. If the pattern doesn't<br>contain any glob syntax (? and<br>*), * of glob syntax will be<br>added at begin and end of the<br>string automatically for<br>partially matching the pattern.<br>2. You can use "," to separate<br>multiple glob patterns.**|Glob patterns|(None)|2 and later|
|`filetype`|Optional. "file": only<br>enumerate regular files; "dir":<br>only enumerate folders; "all"<br>enumerate regular files and<br>folders.|file, dir or all|all|2 and later|
|`goto_path`|Optional. Folder path starting<br>with a shared folder. Return all<br>files and sub-folders within<br>` folder_path` path until<br>` goto_path` path recursively.<br>**Note**: ` goto_path` is only valid<br>with parameter "additional"<br>contains**real_path**.|String|(None)|2 and later|




**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`additional`|Optional. Additional requested<br>file information separated by a<br>comma "," and around the<br>brackets. When an additional<br>option is requested,<br>responded objects will be<br>provided in the specified<br>additional option.<br>Options include:<br>**real_path**: return a real<br>path in volume.<br>**size**: return file byte size.<br>**owner**: return information<br>about file owner including<br>user name, group name,<br>UID and GID.<br>**time**: return information<br>about time including last<br>access time, last modified<br>time, last change time<br>and create time.<br>**perm**: return information<br>about file permission.<br>**mount_point_type**:<br>return a type of a virtual<br>file system of a mount<br>point.<br>**type**: return a file<br>extension.|real_path, size,<br>owner, time,<br>perm, type or<br>mount_point_type|(None)|2 and later|


**Example:**











**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of files.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`files`|` <JSON-Style Array>`|Array of` <file>` objects.|2 and later|



`<file>` object definition:


31 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**












|Parameter|Type|Description|Availability|
|---|---|---|---|
|`path`|String|Folder/file path starting with a shared folder.|2 and later|
|`name`|String|File name.|2 and later|
|`isdir`|Boolean|If this file is a folder or not.|2 and later|
|`children`|` <children>`<br>object|File list within a folder which is described by a` <file>`<br>object. The value is returned, only if goto_path<br>parameter is given.|2 and later|
|`additional`|` <file`<br>`additional>`<br>object|File additional object.|2 and later|



`<children>` object definition:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of files.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`files`|` <JSON-Style Array>`|Array of` <file>` objects.|2 and later|



`<file additional>` object definition:















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`real_path`|String|Real path starting with a volume path.|2 and later|
|`size`|Integer|File size.|2 and later|
|`owner`|` <owner>`<br>object|File owner information including user name,<br>group name, UID and GID.|2 and later|
|`time`|` <time>`<br>object|Time information of file including last access time,<br>last modified time, last change time and create<br>time.|2 and later|
|`perm`|` <perm>`<br>object|File permission information.|2 and later|
|`mount_point_type`|String|A type of a virtual file system of a mount point.|2 and later|
|`type`|String|File extension.|2 and later|


`<owner>` object definition:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`user`|String|User name of file owner.|2 and later|
|`group`|String|Group name of file group.|2 and later|
|`uid`|Integer|File UID.|2 and later|
|`gid`|Integer|File GID.|2 and later|



`<time>` object definition:


32 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**







|Parameter|Type|Description|Availability|
|---|---|---|---|
|`atime`|Linux timestamp in<br>second|Linux timestamp of last access in second.|2 and later|
|`mtime`|Linux timestamp in<br>second|Linux timestamp of last modification in<br>second.|2 and later|
|`ctime`|Linux timestamp in<br>second|Linux timestamp of last change in second.|2 and later|
|`crtime`|Linux timestamp in<br>second|Linux timestamp of create time in second.|2 and later|


Note: Linux timestamp, defined as the number of seconds that have elapsed since 00:00:00 Coordinated

Universal Time (UTC), Thursday, 1 January 1970.


`<perm>` object definition:



|Parameter|Type|Description|Availability|
|---|---|---|---|
|`posix`|Integer|POSIX file permission. For example, 777 means owner,<br>group or other has all permission; 764 means owner has<br>all permission, group has read/write permission, other<br>has read permission.|2 and later|
|`is_acl_mode`|Boolean|` true`: the privilege of the shared folder is set to be ACL-<br>mode;` false`: the privilege of the shared folder is set to<br>be POSIX-mode.|2 and later|
|`acl`|Object|Windows ACL privilege. If a file is set to be POSIX-<br>mode, these values of Windows ACL privilege are<br>derived from the POSIX privilege.|2 and later|


`<acl>` object definition:







|Parameter|Type|Description|Availability|
|---|---|---|---|
|`append`|Boolean|If a logged-in user has a privilege to append data or create<br>folders within this folder or not.|2 and later|
|`del`|Boolean|If a logged-in user has a privilege to delete a file/a folder<br>within this folder or not.|2 and later|
|`exec`|Boolean|If a logged-in user has a privilege to execute files or traverse<br>folders within this folder or not.|2 and later|
|`read`|Boolean|If a logged-in user has a privilege to read data or list folder<br>within this folder or not.|2 and later|
|`write`|Boolean|If a logged-in user has a privilege to write data or create files<br>within this folder or not.|2 and later|


**Example:**


33 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
 {
    "files": [
 {
         "additional": {
           "owner": {
             "gid": 100,
             "group": "users",
             "uid": 1024,
             "user": "admin"
 },
           "perm": {
             "acl": {
                "append": true,
                "del": true,
                "exec": true,
                "read": true,
                "write": true
 },
             "is_acl_mode": false,
             "posix": 777
 },
           "real_path": "/volume1/video/1",
           "size": 4096,
           "time":{
             "atime": 1370104559,
             "crtime": 1370104559,
             "ctime": 1370104559,
             "mtime": 1369728913
 },
           "type": ""
 },
         "isdir": true,
         "name": "1",
         "path": "/video/1"
 },
 {
         "additional": {
           "owner": {
             "gid": 100,
             "group": "users",
             "uid": 1024,
             "user": "admin"
 },
           "perm": {
             "acl": {
                "append": true,
                "del": true,
                "exec": true,
                "read": true,
                "write": true
 },
             "is_acl_mode": false,
             "posix": 777
 },
           "real_path": "/volume1/video/2.txt",
           "size": 12800,
           "time":{
             "atime": 1369964337,
             "crtime": 1369964337,
             "ctime": 1372410504,
             "mtime": 1369964408
 },
           "type": "TXT"
 },
         "isdir": false,

```

34 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
         "name": "2.txt",
         "path": "/video/2.txt"
 }
 ],
    "offset": 0,
    "total": 2
 }

##### **getinfo**

```

**Description:**


Get information of file(s).


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|One or more folder/file path(s)<br>starting with a shared folder,<br>separated by a comma "," and<br>around backets.|String|(None)|2 and later|
|`additional`|Optional. Additional requested<br>file information, separated by a<br>comma "," and around the<br>brackets. When an additional<br>option is requested, responded<br>objects will be provided in the<br>specified additional option.<br>Options include:<br>**real_path**: return a real<br>path in volume.<br>**size**: return file byte size.<br>**owner**: return information<br>about file owner including<br>user name, group name,<br>UID and GID.<br>**time**: return information<br>about time including last<br>access time, last modified<br>time, last change time and<br>create time.<br>**perm**: return information<br>about file permission.<br>**mount_point_type**: return<br>a type of a virtual file<br>system of a mount point.<br>**type**: return a file<br>extension|real_path, size,<br>owner, time, perm,<br>type or<br>mount_point_type</li>|(None)|2 and later|


**Example:**













35 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`files`|` <JSON-Style Array>`|Array of` <file>` objects.|2 and later|



`<file>` object definition:






|Parameter|Type|Description|Availability|
|---|---|---|---|
|`path`|String|Folder/file path starting with a shared<br>folder.|2 and later|
|`name`|String|File name.|2 and later|
|`isdir`|Boolean|If this file is a folder or not.|2 and later|
|`additional`|` <file additional>`<br>object|File additional object.|2 and later|



`<file additional>` object definition: Same as definition in the list method.


**Example:**


36 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




**Synology File Station Official API**

```
         "name": "2.txt",
         "path": "/video/2.txt"
 }
 ]
 }

##### **_API Error Code_**

```

No specific API error codes.


38 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Search**~~

##### **_Description_**


Search files according to given criteria.


This is a non-blocking API. You need to start to search files with the `start` method. Then, you should poll

requests with `list` method to get more information, or make a request with the `stop` method to cancel the

operation. Otherwise, search results are stored in a search temporary database so you need to call `clean`

method to delete it at the end of operation.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **start**


**Description:**


Start to search files according to given criteria. If more than one criterion is given in different parameters,

searched files match all these criteria.


**Availability:**


Since version 2.


**Request:**


39 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


























|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`folder_path`|A searched folder path starting with a<br>shared folder. One or more folder paths to<br>be searched, separated by commas ","<br>and around brackets.|String|(None)|2 and later|
|`recursive`|Optional. If searching files within a folder<br>and subfolders recursively or not.|Boolean|true|2 and later|
|`pattern`|Optional. Search for files whose names<br>and extensions match a case-insensitive<br>glob pattern.<br>Note:<br>1. If the pattern doesn't contain any glob<br>syntax (? and *), * of glob syntax will be<br>added at begin and end of the string<br>automatically for partially matching the<br>pattern.<br>2. You can use " " to separate multiple<br>glob patterns.|Glob<br>patterns|(None)|2 and later|
|`extension`|Optional. Search for files whose<br>extensions match a file type pattern in a<br>case-insensitive glob pattern. If you give<br>this criterion, folders aren't matched.<br>Note: You can use commas "," to separate<br>multiple glob patterns.|Glob<br>patterns|(None)|2 and later|
|`filetype`|Optional. "file": enumerate regular files;<br>"dir": enumerate folders; "all" enumerate<br>regular files and folders.|file, dir or<br>all|all|2 and later|
|`size_from`|Optional. Search for files whose sizes are<br>greater than the given byte size.|Byte size|(None)|2 and later|
|`size_to`|Optional. Search for files whose sizes are<br>less than the given byte size.|Byte size|(None)|2 and later|
|`mtime_from`|Optional. Search for files whose last<br>modified time after the given Linux<br>timestamp in second.|Linux<br>timestamp<br>in second|(None)|2 and later|
|`mtime_to`|Optional. Search for files whose last<br>modified time before the given Linux<br>timestamp in second.|Linux<br>timestamp<br>in second|(None)|2 and later|
|`crtime_from`|Optional. Search for files whose create<br>time after the given Linux timestamp in<br>second.|Linux<br>timestamp<br>in second|(None)|2 and later|
|`crtime_to`|Optional. Search for files whose create<br>time before the given Linux timestamp in<br>second.|Linux<br>timestamp<br>in second|(None)|2 and later|
|`atime_from`|Optional. Search for files whose last<br>access time after the given Linux<br>timestamp in second.|Linux<br>timestamp<br>in second|(None)|2 and later|
|`atime_to`|Optional. Search for files whose last<br>access time before the given Linux<br>timestamp in second.|Linux<br>timestamp<br>in second|(None)|2 and later|




**Synology File Station Official API**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`owner`|Optional. Search for files whose user<br>name matches this criterion. This criterion<br>is case-insensitive.|String|(None)|2 and later|
|`group`|Optional. Search for files whose group<br>name matches this criterion. This criterion<br>is case-insensitive.|String|(None)|2 and later|



Note: Linux timestamp in second, defined as the number of seconds that have elapsed since 00:00:00

Coordinated Universal Time (UTC), Thursday, 1 January 1970.


**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the search task|2 and later|



**Example:**




##### **list**

**Description:**


List matched files in a search temporary database. You can check the finished value in response to know if the

search operation is processing or has been finished.


**Availability:**


Since version 2.


**Request:**


41 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**














|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`taskid`|A unique ID for the search task<br>which is obtained from` start`<br>method.|String|(None)|2 and later|
|`offset`|Optional. Specify how many<br>matched files are skipped before<br>beginning to return listed matched<br>files.|Integer|0|2 and later|
|`limit`|Optional. Number of matched files<br>requested. -1 indicates to list all<br>matched files. 0 indicates to list<br>nothing.|Integer|0|2 and later|
|`sort_by`|Optional. Specify which file<br>information to sort on.<br>Options include:<br>**name**: file name.<br>**size**: file size.<br>**user**: file owner.<br>**group**: file group.<br>**mtime**: last modified time.<br>**atime**: last access time.<br>**ctime**: last change time.<br>**crtime**: create time.<br>**posix**: POSIX permission.<br>**type**: file extension.|name, size,<br>user, group,<br>mtime,<br>atime, ctime,<br>crtime, posix<br>or type|name|2 and later|
|`sort_direction`|Optional. Specify to sort ascending<br>or to sort descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|2 and later|
|`pattern`|Optional. Given glob pattern(s) to<br>find files whose names and<br>extensions match a case-<br>insensitive glob pattern.<br>Note:<br>1. If the pattern doesn't contain any<br>glob syntax (? and *), * of glob<br>syntax will be added at begin and<br>end of the string automatically for<br>partially matching the pattern.<br>2. You can use " " to separate<br>multiple glob patterns.|Glob<br>patterns|String|2 and later|
|`filetype`|Optional. "file": enumerate regular<br>files; "dir": enumerate folders; "all"<br>enumerate regular files and folders.|file, dir or all|all|2 and later|




**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`additional`|Optional. Additional requested file<br>information separated by a comma<br>"," and around the brackets. When<br>an additional option is requested,<br>responded objects will be provided<br>in the specified additional option.<br>Options include:<br>**real_path**: return a real path in<br>volume.<br>**size**: return file byte size.<br>**owner**: returns information about<br>file owner including user name,<br>group name, UID and GID.<br>**time**: return information about time<br>including last access time, last<br>modified time, last change time and<br>create time.<br>**perm**: return information about file<br>permission.<br>**type**: return a file extension.|real_path,<br>size, owner,<br>time, perm<br>or type|(None)|2 and later|


**Example:**











**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of matched files.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`finished`|Boolean|If the searching task is finished or not.|2 and later|
|`files`|` <JSON-Style Array>`|Array of` <file>` objects.|2 and later|



`<file>` object definitions:


Same as definition in the `list` method of SYNO.FileStation.List API


**Example:**


43 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
 {
    "files": [
 {
         "additional": {
           "owner": {
             "gid": 100,
             "group": "users",
             "uid": 1024,
             "user": "admin"
 },
           "perm": {
             "acl": {
                "append": true,
                "del": true,
                "exec": true,
                "read": true,
                "write": true
 },
             "is_acl_mode": false,
             "posix": 644
 },
           "real_path": "/volume1/video/12",
           "size": 0,
           "time": {
             "atime": 1370002059,
             "crtime": 1370002059,
             "ctime": 1370002099,
             "mtime": 1370002059
 },
           "type": ""
 },
         "isdir": false,
         "name": "12",
         "path": "/video/12"
 },
 {
         "additional": {
           "owner": {
             "gid": 100,
             "group": "users",
             "uid": 1024,
             "user": "admin"
 },
           "perm": {
             "acl": {
                "append": true,
                "del": true,
                "exec": true,
                "read": true,
                "write": true
 },
             "is_acl_mode": true,
             "posix": 70
 },
           "real_path": "/volume1/video/1GFILE.txt",
           "size": 1073741825,
           "time": {
             "atime": 1370522981,
             "crtime": 1370522690,
             "ctime": 1370522815,
             "mtime": 1370522814
 },
           "type": "TXT"
 },
         "isdir": false,

```

44 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
         "name": "1GFILE.txt",
         "path": "/video/1GFILE.txt"
 }
 ],
    "finished": true,
    "offset": 0,
    "total": 2
 }

##### **stop**

```

**Description:**


Stop the searching task(s). The search temporary database won't be deleted, so it's possible to list the search

result using list method after stopping it.


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|Unique ID(s) for the search task which are<br>obtained from` start` method. Specify multiple<br>search task IDs separated by a comma "," and<br>around the brackets.|String|(None)|2 and later|


**Example:**









**Response:**


No specific response. It returns an empty success response if completed without error.

##### **clean**


**Description:**


Delete search temporary database(s).


**Availability:**


Since version 1.


**Request:**








|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|Unique ID(s) for the search task which are<br>obtained from` start` method. Specify multiple<br>search task IDs separated by a comma "," and<br>around the brackets.|String|(None)|2 and later|



45 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**


No specific API error codes.


46 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.VirtualFolder**~~

##### **_Description_**


List all mount point folders of virtual file system, e.g., CIFS or ISO.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **list**


**Description:**


List all mount point folders on one given type of virtual file system.


**Availability:**


Since version 2.


**Request:**


47 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`type`|A type of virtual file systems,<br>e.g., NFS, CIFS or ISO.|Nfs, cifs or iso|(None)|2 and later|
|`offset`|Optional. Specify how many<br>mount point folders are<br>skipped before beginning to<br>return listed mount point<br>folders in virtual file system.|Integer|0|2 and later|
|`limit`|Optional. Number of mount<br>point folders requested. 0<br>indicates to list all mount point<br>folders in virtual file system.|Integer|0|2 and later|
|`sort_by`|Optional. Specify which file<br>information to sort on.<br>Options include:<br>**name**: file name.<br>**user**: file owner.<br>**group**: file group.<br>**mtime**: last modified time.<br>**atime**: last access time.<br>**ctime**: last change time.<br>**crtime**: create time.<br>**posix**: POSIX permission.|name, user,<br>group, mtime,<br>atime, ctime,<br>crtime or posix|Name|2 and later|
|`sort_direction`|Optional. Specify to sort<br>ascending or to sort<br>descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|2 and later|
|`additional`|Optional. Additional requested<br>file information separated by a<br>comma "," and around the<br>brackets. When an additional<br>option is requested,<br>responded objects will be<br>provided in the specified<br>additional option.<br>Options include:<br>**real_path**: return a real path<br>in volume.<br>**size**: return file byte size.<br>**owner**: return information<br>about file owner including user<br>name, group name, UID and<br>GID.<br>**time**: return information about<br>time including last access<br>time, last modified time, last<br>change time and create time.<br>**perm**: return information about<br>file permission.<br>**volume_status**: return<br>information about volume<br>status including free space,<br>total space and read-only<br>status.|real_path, owner,<br>time, perm,<br>mount_point_type<br>or volume_status|(None)|2 and later|


**Example:**

















48 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of mount point folders.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`folders`|` <JSON-Style Array>`|Array of` <virtual folder>` object.|2 and later|



`<virtual folder>` object definition:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`path`|String|Path of a mount point folder.|2 and later|
|`name`|String|Name of a mount point folder.|2 and later|
|`additional`|` <virtual-folder additional>` object|Virtual folder additional object.|2 and later|



`<virtual-folder additional>` object definition:
















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`real_path`|String|Real path starting with a volume path.|2 and later|
|`owner`|` <owner>` object|File owner information including user<br>name, group name, UID and GID.|2 and later|
|`time`|` <time>` object|Time information of file including last<br>access time, last modified time, last<br>change time and create time.|2 and later|
|`perm`|` <perm>` object|File permission information.|2 and later|
|`mount_point_type`|String|A type of a virtual file system of a mount<br>point.|2 and later|
|`volume_status`|` <volume_status>`<br>object|Volume status including free space, total<br>space and read-only status.|2 and later|



`<owner>`, `<time>` and `<perm>` object definition: Same as definition in the `list` method of

SYNO.FileStation.List API.


`<volume_status>` object definition: Same as definition in the `list_share` method of SYNO.FileStation.List API.


**Example:**


49 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




##### **_API Error Code_**

No specific API error codes.


50 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Favorite**~~

##### **_Description_**


Add a folder to user's favorites or perform operations on user's favorites.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **list**


**Description:**


List user's favorites.


**Availability:**


Since version 2.


**Request:**


51 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`offset`|Optional. Specify how many favorites<br>are skipped before beginning to return<br>user's favorites.|Integer|0|2 and later|
|`limit`|Optional. Number of favorites<br>requested. 0 indicates to list all<br>favorites.|Integer|0|2 and later|
|`status_filter`|Optional. Show favorites with a given<br>favorite status. Options of favorite<br>statuses include:<br>**valid**: A folder which a favorite links to<br>exists.<br>**broken**: A folder which a favorite links<br>to doesn't exist or isn't permitted to<br>access it.<br>**all**: Both valid and broken statuses.|valid,<br>broken or<br>all|all|2 and later|
|`additional`|Optional. Additional requested<br>information of a folder which a favorite<br>links to separated by a comma "," and<br>around the brackets. When an<br>additional option is requested,<br>responded objects will be provided in<br>the specified additional option.<br>Options include:<br>**real_path**: return a real path in volume.<br>**owner**: return information about file<br>owner including user name, group<br>name, UID and GID.<br>**time**: return information about time<br>including last access time, last modified<br>time, last change time and create time.<br>**perm**: return information about file<br>permission.<br>**mount_point_type**: return a type of a<br>virtual file system of a mount point.|name,<br>size, user,<br>group,<br>mtime,<br>atime,<br>ctime,<br>crtime,<br>posix or<br>type|name|2 and later|


**Example:**













**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of favorites.|2 and later|
|`offset`|Integer|Requested offset.|2 and later|
|`favorites`|` <JSON-Style Array>`|Array of` <favorite>` objects.|2 and later|



`<favorite>` object definition:


52 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**














|Parameter|Type|Description|Availability|
|---|---|---|---|
|`path`|String|Folder path of a user's favorites, starting with a<br>shared folder.|2 and later|
|`name`|String|Favorite name.|2 and later|
|`status`|String|Favorite status. Values of favorite status include:<br>**valid**: A folder, which a favorite links to, exists.<br>**broken**: A folder, which a favorite links to, doesn't<br>exist or is not permitted to access it.|2 and later|
|`additional`|` <favorite`<br>`additional>`<br>object|Favorite additional object.|2 and later|



`<favorite additional>` object definition:















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`real_path`|String|Real path starting with a volume path.|2 and later|
|`owner`|` <owner>`<br>object|File owner information including user name,<br>group name, UID and GID.|2 and later|
|`time`|` <time>`<br>object|Time information of file including last access time,<br>last modified time, last change time and create<br>time.|2 and later|
|`perm`|` <perm>`<br>object|File permission information.|2 and later|
|`mount_point_type`|String|A type of a virtual file system of a mount point.|2 and later|
|`type`|String|File extension.|2 and later|


`<owner>`, `<time>`, `<perm>` object definition: Same as definition in the `list` method of SYNO.FileStation.List

API.


**Example:**




##### **add**

~~**Description:**~~


53 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


Add a folder to user's favorites.


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|A folder path starting with a shared folder is<br>added to the user's favorites.|String|(None)|2 and later|
|`name`|A favorite name.|String|(None)|2 and later|
|`index`|Optional. Index of location of an added favorite. If<br>it's equal to -1, the favorite will be added to the<br>last one in user's favorite. If it's between 0 ~ total<br>number of favorites-1, the favorite will be inserted<br>into user's favorites by the index.|Integer|-1|2 and later|


**Example:**









**Response:**


No specific response. It returns an empty success response if completed without error.

##### **delete**


**Description:**


Delete a favorite in user's favorites.


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|A folder path starting with a shared folder is<br>deleted from a user's favorites.|String|(None)|2 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.


54 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


##### **clear_broken**

**Description:**


Delete all broken statuses of favorites.


**Availability:**


Since version 2.


**Request:**


No parameters are required.


**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **edit**


**Description:**


Edit a favorite name.


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|A folder path starting with a shared folder is<br>edited from a user's favorites.|String|(None)|2 and later|
|`name`|New favorite name.|String|(None)|2 and later|



**Example:**


**Response:**


No specific response. It returns an empty success response if completed without error.

##### **replace_all**


**Description:**


Replace multiple favorites of folders to the existing user's favorites.


55 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`Path`|One or more folder paths starting with a shared<br>folder, separated by a comma "," and around the<br>brackets is added to the user's favorites. The<br>number of paths must be the same as the number<br>of favorite names in the name parameter. The first<br>path parameter corresponds to the first name<br>parameter.|String|(None)|2 and later|
|`Name`|One or more new favorite names, separated by a<br>comma "," and around the brackets. The number<br>of favorite names must be the same as the<br>number of folder paths in the` path` parameter.<br>The first` name` parameter corresponding to the<br>first` path` parameter.|String|(None)|2 and later|


**Example:**









**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**

|Code|Description|
|---|---|
|`800`|A folder path of favorite folder is already added to user's favorites.|
|`801`|A name of favorite folder conflicts with an existing folder path in the user's favorites.|
|`802`|There are too many favorites to be added.|



56 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Thumb**~~

##### **_Description_**


Get a thumbnail of a file.


Note:


1. Supported image formats: jpg, jpeg, jpe, bmp, png, tif, tiff, gif, arw, srf, sr2, dcr, k25, kdc, cr2, crw, nef, mrw,

ptx, pef, raf, 3fr, erf, mef, mos, orf, rw2, dng, x3f, heic, raw.

2. Supported video formats in an indexed folder: 3gp, 3g2, asf, dat, divx, dvr-ms, m2t, m2ts, m4v, mkv, mp4,

mts, mov, qt, tp, trp, ts, vob, wmv, xvid, ac3, amr, rm, rmvb, ifo, mpeg, mpg, mpe, m1v, m2v, mpeg1, mpeg2,

mpeg4, ogv, webm, flv, f4v, avi, swf, vdr, iso, hevc.

3. Video thumbnails exist only if video files are placed in the "photo" shared folder or users' home folders.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **get**


**Description:**


Get a thumbnail of a file.


**Availability:**


Since version 2.


**Request:**


57 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|A file path starting with a<br>shared folder.|String|(None)|2 and later|
|`size`|Optional. Return different size<br>thumbnail.<br>Size Options:<br>**small**: small-size thumbnail.<br>**medium**: medium-size<br>thumbnail.<br>**large**: large-size thumbnail.<br>**original**: original-size<br>thumbnail.|small, medium, large<br>or original|small|2 and later|
|`rotate`|Optional. Return rotated<br>thumbnail.<br>Rotate Options:<br>0: Do not rotate.<br>1: Rotate 90°.<br>2: Rotate 180°.<br>3: Rotate 270°.<br>4: Rotate 360°.|0, 1, 2, 3, 4|0|2 and later|


**Example:**









**Response:**


Image binary data.

##### **_API Error Code_**


Standard HTTP status codes.


For example, 404 Not Found.


58 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.DirSize**~~

##### **_Description_**


Get the accumulated size of files/folders within folder(s).


This is a non-blocking API. You need to start it with the `start` method. Then, you should poll requests with the

`status` method to get progress status or make a request with `stop` method to cancel the operation.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **start**


**Description:**


Start to calculate size for one or more file/folder paths.


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|One or more file/folder paths starting with a shared<br>folder for calculating cumulative size, separated by<br>a comma "," and around the brackets.|String|(None)|2 and later|


**Example:**









**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the size calculating task.|2|



**Example:**


59 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **status**


**Description:**


Get the status of the size calculating task.


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the task which is obtained from<br>` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`finished`|Boolean|If the task is finished or not.|2|
|`num_dir`|Integer|Number of directories in the queried path(s).|2|
|`num_file`|Integer|Number of files in the queried path(s).|2|
|`total_size`|Integer|Accumulated byte size of the queried path(s).|2|



**Example:**




##### **stop**

**Description:**


Stop the calculation.


60 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`tasked`|A unique ID for the task which is obtained from<br>` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**


No specific API error codes.


61 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.MD5**~~

##### **_Description_**


Get MD5 of a file.


This is a non-blocking API. You need to start it with the `start` method. Then, you should poll requests with

`status` method to get the progress status, or make a request with the `stop` method to cancel the operation.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **start**


**Description:**


Start to get MD5 of a file.


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`file_path`|A file path starting with a shared folder for<br>calculating MD5 value.|String|(None)|2 and later|



**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the task for the MD5 calculation task.|2|



**Example:**


62 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




##### **status**

**Description:**


Get the status of the MD5 calculation task.


**Availability:**


Since version 1


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the task which is obtained from<br>` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`finished`|Boolean|Check if the task is finished or not.|2|
|`md5`|String|MD5 of the requested file.|2|



**Example:**




##### **stop**

**Description:**


Stop calculating the MD5 of a file.


**Availability:**


Since version 23


**Request:**


63 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`taskid`|A unique ID for the task which is obtained from<br>` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**


No specific API error codes.


64 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.CheckPermission**~~

##### **_Description_**


Check if a logged-in user has permission to do file operations on a given folder/file.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 3

##### **_Method_** **write**


**Description:**


Check if a logged-in user has write permission to create new files/folders in a given folder.


**Availability:**


Since version 3.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|A folder path starting with a shared folder to<br>check write permission.|String|(None)|3 and later|
|`filename`|A filename you want to write to given path|String|(None)|3 and later|
|`overwrite`|Optional. The value could be one of<br>following:<br>"**true**": overwrite the destination file if one<br>exists.<br>"**false**": skip if the destination file exists.<br>Note: when it's not specified as true or false,<br>it will be responded with error when the<br>destination file exists.|Boolean|(None)|3 and later|
|`create_only`|Optional. If set to "**true**", the permission will<br>be allowed when there is non-existent<br>file/folder.|Boolean|true|3 and later|


**Example:**









**Response:**


The request will get error response if no write permission for the specified path.


65 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **_API Error Code_**


No specific API error codes.


66 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Upload**~~

##### **_Description_**


Upload a file.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **upload**


**Description:**


[Upload a file by RFC 1867, http://tools.ietf.org/html/rfc1867.](http://tools.ietf.org/html/rfc1867)


Note that each parameter is passed within each part but binary file data must be the last part.


**Availability:**


Since version 2.


**Request:**


67 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



















|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|A destination folder path starting with<br>a shared folder to which files can be<br>uploaded.|String|(None)|2 and later|
|`create_parents`|Create parent folder(s) if none exist.|Boolean|(None)|2 and later|
|`overwrite`|Optional. The value could be one of<br>following:<br>**Version 2**:<br> ` true`: overwrite the destination file<br>if one exists.<br> ` false`: skip the upload if the<br>destination file exists.<br>**Version 3**:<br> **overwrite**: overwrite the destination<br>file if one exists.<br> **skip**: skip the upload if the<br>destination file exists.<br>**Note**: when it's not specified as<br>` true`(**overwrite**) or` false`(**skip**),<br>the upload will be responded with<br>error when the destination file exists.|**Version 2**:<br>true / false<br>/ (None)<br>**Version 3**:<br>String|(None)|2 and later|
|`mtime`|Optional. Set last modify time of the<br>uploaded file, unit: Linux timestamp<br>in millisecond.|Linux<br>timestamp<br>in<br>millisecond|(None)|2 and later|
|`crtime`|Optional. Set the create time of the<br>uploaded file, unit: Linux timestamp<br>in millisecond.|Linux<br>timestamp<br>in<br>millisecond|(None)|2 and later|
|`atime`|Optional. Set last access time of the<br>uploaded file, unit: Linux timestamp<br>in millisecond.|Linux<br>timestamp<br>in<br>millisecond|(None)|2 and later|
|`filename (file`<br>`part)`|File content. Must be the last part.|Binary<br>data|(None)|2 and later|


**Note:** Linux timestamp in millisecond, defined as the number of milliseconds that have elapsed since 00:00:00

Coordinated Universal Time (UTC), Thursday, 1 January 1970.


**Example:**


68 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**





**Response:**


69 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**

|Code|Description|
|---|---|
|`1800`|There is no Content-Length information in the HTTP header or the received size doesn't match<br>the value of Content-Length information in the HTTP header.|
|`1801`|Wait too long, no date can be received from client (Default maximum wait time is 3600 seconds).|
|`1802`|No filename information in the last part of file content.|
|`1803`|Upload connection is cancelled.|
|`1804`|Failed to upload oversized file to FAT file system.|
|`1805`|Can't overwrite or skip the existing file, if no` overwrite` parameter is given.|



70 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Download**~~

##### **_Description_**


Download file(s)/folder(s).

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **download**


**Description:**


Download files/folders. If only one file is specified, the file content is responded. If more than one file/folder is

given, binary content in ZIP format which they are compressed to is responded.


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|One or more file/folder paths starting with a<br>shared folder to be downloaded, separated by<br>a comma "," and around the brackets. When<br>more than one file is to be downloaded,<br>files/folders will be compressed as a zip file.|String|(None)|2 and later|
|`mode`|Mode used to download files/folders, value<br>could be:<br>"**open**": try to trigger the application, such as a<br>web browser, to open it. Content-Type of the<br>HTTP header of the response is set to MIME<br>type according to file extension.<br>"**download**": try to trigger the application, such<br>as a web browser, to download it. Content-<br>Type of the HTTP header of response is set to<br>application/octet-stream and Content-<br>Disposition of the HTTP header of the<br>response is set to attachment.|open or<br>download|open|2 and later|


**Example:**









~~**Response:**~~


71 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


The file content.

##### **_API Error Code_**


No specific API error codes.


Note: If `mode` parameter is set to **open** value, the status code “404 Not Found” of the HTTP header is responded

when an error occurs.


72 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Sharing**~~

##### **_Description_**


Generate a sharing link to share files/folders with other people and perform operations on sharing link(s).

##### **_Overview_**


Availability: Since DSM 6.0


Version: 3

##### **_Method_** **getinfo**


**Description:**


Get information of a sharing link by the sharing link ID.


**Availability:**


Since version 3.


**Request:**

|Parameter|Description|Value|Default Value|Availability|
|---|---|---|---|---|
|`id`|A unique ID of a sharing link.|String|(None)|3 and later|



**Example:**





**Response:**


Returned `<data>` object is a `<Sharing_Link>` object (defined in the Response Objects section).


**Example:**





73 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **list**


**Description:**


List user's file sharing links.


**Availability:**


Since version 1.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`offset`|Optional. Specify how many<br>sharing links are skipped<br>before beginning to return<br>listed sharing links.|Integer|0|3 and later|
|`limit`|Optional. Number of sharing<br>links requested. 0 means to list<br>all sharing links.|Integer|0|3 and later|
|`sort_by`|Optional. Specify information of<br>the sharing link to sort on.<br>Options include:<br>**id**: a unique ID of sharing a<br>file/folder.<br>**name**: file name.<br>**isFolder**: if it's a folder or not.<br>**path**: file path.<br>**date_expired**: the expiration<br>date for the sharing link.<br>**date_available**: the available<br>date for the sharing link<br>becomes effective.<br>**status**: the link accessibility<br>status.<br>**has_password**: If the sharing<br>link is protected or not.<br>**url**: a URL of a sharing link.<br>**link_owner**: the user name of<br>the sharing link owner.|name, isFolder,<br>path,<br>date_expired,<br>date_available,<br>status,<br>has_password,<br>id, url or<br>link_owner|(None)|3 and later|
|`sort_direction`|Optional. Specify to sort<br>ascending or to sort<br>descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|1 and later|
|`force_clean`|Optional. If set to false, the<br>data will be retrieved from<br>cache database rapidly. If set<br>to true, all sharing information<br>including sharing statuses and<br>user name of sharing owner<br>will be synchronized. It<br>consumes some time.|Boolean|false|1 and later|


**Example:**













74 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of sharing links.|3|
|`offset`|Integer|Requested offset.|3|
|`links`|` <JSON-Style Array>`|Array of` <Sharing_Link>` object.|3|



**Example:**




##### **create**

**Description:**


Generate one or more sharing link(s) by file/folder path(s).


**Availability:**


Since version 3.


**Request:**


75 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**












|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|One or more file/folder paths with which to<br>generate sharing links, separated by<br>commas ",".|String|(None)|3 and later|
|`password`|Optional The password for the sharing link<br>when accessing it. The max password<br>length are 16 characters.|String|(None)|3 and later|
|`date_expired`|Optional. The expiration date for the<br>sharing link, written in the format YYYY-<br>MM-DD. When set to 0 (default), the<br>sharing link is permanent.<br>**Note**: SHOULD put the double quote<br>outside expiration date.|YYYY-<br>MM-<br>DD|0|3 and later|
|`date_available`|Optional. The available date for the<br>sharing link to become effective, written in<br>the format YYYY-MM-DD. When set to 0<br>(default), the sharing link is valid<br>immediately after creation.<br>**Note**: SHOULD put the double quote<br>outside available date.|YYYY-<br>MM-<br>DD|0|3 and later|



**Note** : date of `date_expired` and `date_available` parameter is based on user's DS date.


**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`links`|` <JSON-Style Array>`|Array of` <Shared_Link>` object.|3|



\ object definition:

|Member|Type|Description|Availability|
|---|---|---|---|
|`path`|String|A file/folder path of the sharing link.|3|
|`url`|String|A created URL of the sharing link.|3|
|`id`|String|A created unique ID of the sharing link.|3|
|`qrcode`|String|Base64-encoded image of QR code describing the URL of the<br>sharing link.|3|
|`error`|Integer|0 for creating it successfully, otherwise is the error code for failed<br>to create it.|3|



**Example:**


76 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




##### **delete**

**Description:**


Delete one or more sharing links.


**Availability:**


Since version 3.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`Id`|Unique IDs of file sharing link(s) to be deleted,<br>separated by commas "," and around the brackets.|String|(None)|3 and later|



**Example:**





**Response:**


Returns an empty success response if completed without error; otherwise returns error object array contains

failed IDs.

##### **clear_invalid**


**Description:**


Remove all expired and broken sharing links.


**Availability:**


Since version 3.


**Request:**


No parameters are required.


**Example:**





77 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Response:**


No specific response. It returns an empty success response if completed without error.

##### **edit**


**Description:**


Edit sharing link(s).


**Availability:**


Since version 1.


**Request:**












|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`id`|Unique ID(s) of sharing link(s) to edit,<br>separated by a comma, "," and around<br>the brackets.|Integer|(None)|3 and later|
|`password`|Optional. If empty string is set, the<br>password is removed. The max length of<br>the password is 16 characters.|String|(None)|3 and later|
|`date_expired`|Optional. The expiration date for the<br>sharing link, using format YYYY-MM-DD.<br>When set to 0 (default), the sharing link is<br>permanent.|YYYY-<br>MM-<br>DD|(None)|3 and later|
|`date_available`|Optional. The available date for the<br>sharing link becomes effective, using<br>format YYYY-MM-DD. When set to 0<br>(default), the sharing link is valid right<br>after creation.|YYYY-<br>MM-<br>DD|(None)|3 and later|



Note: date of `date_expired` and `date_available` parameter is based on user's DiskStation date.


**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

### **Response Objects**


`<Sharing_Link>` object definition:


78 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Member|Type|Description|Availability|
|---|---|---|---|
|`id`|String|A unique ID of a sharing link.|3|
|`url`|String|A URL of a sharing link.|3|
|`link_owner`|String|A user name of a sharing link owner.|3|
|`path`|String|A file or folder path of a sharing link.|3|
|`isFolder`|String|Whether the sharing link is for a folder.|3|
|`has_password`|Boolean|Whether the sharing link has password.|3|
|`date_expired`|String|The expiration date of the sharing link in the format<br>YYYY-MM-DD. If the value is set to 0, the link will be<br>permanent.|3|
|`date_available`|String|The date when the sharing link becomes active in the<br>format YYYY-MM-DD. If the value is set to 0, the file<br>sharing link will be active immediately after creation.|3|
|`status`|String|The accessibility status of the sharing link might be<br>one of the following:<br>**valid**: the sharing link is active.<br>**invalid**: the sharing link is not active because the<br>available date has not arrived yet.<br>**expired**: the sharing link expired.<br>**broken**: the sharing link broke due to a change in the<br>file path or access permission.|3|

##### **_API Error Code_**







|Code|Description|
|---|---|
|`2000`|Sharing link does not exist.|
|`2001`|Cannot generate sharing link because too many sharing links exist.|
|`2002`|Failed to access sharing links.|


79 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.CreateFolder**~~

##### **_Description_**


Create folders.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **create**


**Description:**


Create folders.


**Availability:**


Since version 2.


**Request:**


80 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`folder_path`|One or more shared folder paths,<br>separated by commas and around<br>brackets. If` force_parent` is "true," and<br>` folder_path` does not exist, the<br>` folder_path` will be created. If<br>` force_parent` is "false,"` folder_path`<br>must exist or a false value will be<br>returned. The number of paths must be<br>the same as the number of names in the<br>` name` parameter. The first` folder_path`<br>parameter corresponds to the first` name`<br>parameter.|String|(None)|2 and later|
|`name`|One or more new folder names,<br>separated by commas "," and around<br>brackets. The number of names must be<br>the same as the number of folder paths<br>in the` folder_path` parameter. The first<br>` name` parameter corresponding to the<br>first` folder_path` parameter.|String|(None)|2 and later|
|`force_parent`|Optional.<br>` true`: no error occurs if a folder exists<br>and create parent folders as needed.<br>` false`: parent folders are not created.|Boolean|false|2 and later|
|`additional`|Optional. Additional requested file<br>information, separated by commas ","<br>and around brackets. When an additional<br>option is requested, responded objects<br>will be provided in the specified<br>additional option.<br>Options include:<br>**real_path**: return a real path in volume.<br>**size**: return file byte size.<br>**owner**: return information about file<br>owner including user name, group name,<br>UID and GID.<br>**time**: return information about time<br>including last access time, last modified<br>time, last change time and create time.<br>**perm**: return information about file<br>permission.<br>**type**: return a file extension.|real_path,<br>size,<br>owner,<br>time,<br>perm or<br>type|(None)|2 and later|


**Example:**











**Response:**


`<data>` object definitions:



|Parameter|Type|Description|Availability|
|---|---|---|---|
|`folders`|` <JSON-Style`<br>`Array>`|Array of` <file>` objects about file information of a<br>new folder path.|2 and later|


~~`<file>`~~ ~~object definition:~~





81 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



Same as definition in SYNO.FileStation.List API with `getinfo` method.


**Example:**




##### **_API Error Code_**

|Code|Description|
|---|---|
|`1100`|Failed to create a folder. More information in` <errors>` object.|
|`1101`|The number of folders to the parent folder would exceed the system limitation.|



82 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Rename**~~

##### **_Description_**


Rename a file/folder.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **rename**


**Description:**


Rename a file/folder.


**Availability:**


Since version 2.


**Request:**


83 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|One or more paths of files/folders to be<br>renamed, separated by commas "," and<br>around brackets. The number of paths<br>must be the same as the number of<br>names in the` name` parameter. The first<br>` path` parameter corresponds to the<br>first` name` parameter.|String|(None)|2 and later|
|`name`|One or more new names, separated by<br>commas "," and around brackets. The<br>number of names must be the same as<br>the number of folder paths in the` path`<br>parameter. The first` name` parameter<br>corresponding to the first` path`<br>parameter.|String|(None)|2 and later|
|`additional`|Optional. Additional requested file<br>information, separated by commas ","<br>and around brackets. When an<br>additional option is requested,<br>responded objects will be provided in<br>the specified additional option.<br>Options include:<br>**real_path**: return a real path in volume.<br>**size**: return file byte size.<br>**owner**: return information about file<br>owner including user name, group<br>name, UID and GID.<br>**time**: return information about time<br>including last access time, last modified<br>time, last change time and create time.<br>**perm**: return information about file<br>permission.<br>**type**: return a file extension.|real_path,<br>size,<br>owner,<br>time,perm<br>or type|(None)|2 and later|
|`search_taskid`|Optional. A unique ID for the search<br>task which is obtained from` start`<br>method. It is used to update the<br>renamed file in the search result.|String|(None)|2 and later|


**Example:**















**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`files`|` <JSON-Style Array>`|Array of` <file>` objects.|2 and later|



`<file>` object definition:


Same as definition in SYNO.FileStation.List API with `getinfo` method.


**Example:**


84 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




##### **_API Error Code_**

|Code|Description|
|---|---|
|`1200`|Failed to rename it. More information in` <errors>` object.|



85 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.CopyMove**~~

##### **_Description_**


Copy/move file(s)/folder(s).


This is a non-blocking API. You need to start to copy/move files with `start` method. Then, you should poll

requests with `status` method to get the progress status, or make a request with `stop` method to cancel the

operation.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 3

##### **_Method_** **start**


**Description:**


Start to copy/move files.


**Availability:**


Since version 3.


**Request:**


86 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**











|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|One or more copied/moved<br>file/folder path(s) starting with a<br>shared folder, separated by<br>commas "," and around brackets.|String|(None)|3 and later|
|`dest_folder_path`|A destination folder path where<br>files/folders are copied/moved.|String|(None)|3 and later|
|`overwrite`|Optional.` true`: overwrite all<br>existing files with the same name.<br>` false`: skip all existing files with<br>the same name.<br>Note: do not overwrite or skip<br>existed files. If there is any existing<br>files, an error occurs (error code:<br>1003).|true,<br>false,<br>(None)|(None)|3 and later|
|`remove_src`|Optional.` true`: move<br>filess/folders.` false`: copy<br>files/folders|Boolean|false|3 and later|
|`accurate_progress`|Optional.` true`: calculate the<br>progress by each moved/copied file<br>within sub-folder.` false`: calculate<br>the progress by files which you give<br>in path parameters. This calculates<br>the progress faster, but is less<br>precise.|Boolean|true|3 and later|
|`search_taskid`|Optional. A unique ID for the search<br>task which is obtained from<br>SYNO.FileSation.Search API with<br>` start` method. This is used to<br>update the search result.|String|(None)|3 and later|


**Example:**













**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the copy/move task.|3 and later|



**Example:**




##### **status**

**Description:**


87 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


Get the copying/moving status.


**Availability:**


Since version 3.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the copy/move task which is<br>obtained from` start` method.|String|(None)|3 and later|



**Example:**


**Response:**


`<data>` object definitions:

















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`processed_size`|Integer|If` accurate_progress` parameter is` true`, byte<br>sizes of all copied/moved files will be<br>accumulated. If` false`, only byte sizes of the file<br>you give in` path` parameter is accumulated.|3 and later|
|`total`|Integer|If accurate_progress parameter is` true`, the<br>value indicates total byte sizes of files including<br>subfolders will be copied/moved. If` false`, it<br>indicates total byte sizes of files you give in` path`<br>parameter excluding files within subfolders.<br>Otherwise, when the total number is calculating,<br>the value is -1.|3 and later|
|`path`|String|A copying/moving path which you give in` path`<br>parameter.|3 and later|
|`finished`|Boolean|If the copy/move task is finished or not.|3 and later|
|`progress`|Double|A progress value is between 0~1. It is equal to<br>` processed_size` parameter divided by` total`<br>parameter.|3 and later|
|`dest_folder_path`|String|A destination folder path where files/folders are<br>copied/moved.|3 and later|


**Example:**





88 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **stop**


**Description:**


Stop a copy/move task.


**Availability:**


Since version 3.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the copy/move task which is<br>obtained from` start` method.|String|(None)|3 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**

|Code|Description|
|---|---|
|`1000`|Failed to copy files/folders. More information in` <errors>` object.|
|`1001`|Failed to move files/folders. More information in` <errors>` object.|
|`1002`|An error occurred at the destination. More information in` <errors>` object.|
|`1003`|Cannot overwrite or skip the existing file because no` overwrite` parameter is given.|
|`1004`|File cannot overwrite a folder with the same name, or folder cannot overwrite a file with the same<br>name.|
|`1006`|Cannot copy/move file/folder with special characters to a FAT32 file system.|
|`1007`|Cannot copy/move a file bigger than 4G to a FAT32 file system.|



89 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Delete**~~

##### **_Description_**


Delete file(s)/folder(s).


There are two methods; one is a non-blocking method; and the other is a blocking method. With the non-blocking

method, you can start the deletion operation using the `start` method. Then, you should poll a request with the

`status` method to get more information or make a request with the `stop` method to cancel the operation. With

the blocking method, you can directly make requests with `delete` method to delete files/folders, but the

response is not returned until the delete operation is completed.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **start**


**Description:**


Delete file(s)/folder(s).


This is a non-blocking method. You should poll a request with `status` method to get more information or make a

request with `stop` method to cancel the operation.


**Availability:**


Since version 2.


**Request:**


90 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|One or more deleted file/folder<br>paths starting with a shared folder,<br>separated by commas "," and<br>around brackets.|String|(None)|2 and later|
|`accurate_progress`|Optional.` true`: calculates the<br>progress of each deleted file with<br>the sub-folder recursively.` false`:<br>calculates the progress of files<br>which you give in` path`<br>parameters. The latter is faster than<br>recursively, but less precise.<br>Note: Only non-blocking methods<br>suits using the` status` method to<br>get progress.|Boolean|true|2 and later|
|`recursive`|Optional.` true`: Recursively delete<br>files within a folder.` false`: Only<br>delete first-level file/folder. If a<br>deleted folder contains any file, an<br>error occurs because the folder<br>can't be directly deleted.|Boolean|true|2 and later|
|`search_taskid`|Optional. A unique ID for the search<br>task which is obtained from` start`<br>method. It's used to delete the file in<br>the search result.|String|(None)|2 and later|


**Example:**









**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the delete task.|2 and later|



**Example:**




##### **status**

**Description:**


Get the deleting status.


**Availability:**


Since version 2.


91 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the delete task which is obtained<br>from` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


`<data>` object definitions:











|Parameter|Type|Description|Availability|
|---|---|---|---|
|`processed_num`|Integer|If` accurate_progress` parameter is` true`, the<br>number of all deleted files will be accumulated. If<br>` false`, only the number of file you give in` path`<br>parameter is accumulated.|2 and later|
|`total`|Integer|If` accurate_progress` parameter is` true`, the value<br>indicates how many files including subfolders will<br>be deleted. If` false`, it indicates how many files<br>you give in` path` parameter. When the total<br>number is calculating, the value is -1.|2 and later|
|`path`|String|A deletion path which you give in` path` parameter.|2 and later|
|`processing_path`|String|A deletion path which could be located at a<br>subfolder.|2 and later|
|`finished`|Boolean|Whether or not the deletion task is finished.|2 and later|
|`progress`|Double|Progress value whose range between 0~1 is equal<br>to` processed_num` parameter divided by` total`<br>parameter.|2 and later|


**Example:**








##### **stop**

**Description:**


Stop a delete task.


**Availability:**


92 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


Since version 2.


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the deletion task which is<br>obtained from` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **delete**


**Description:**


Delete files/folders. This is a blocking method. The response is not returned until the deletion operation is

completed.


**Availability:**


Since version 2.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`path`|One or more deleted file/folder path(s)<br>starting with a shared folder, separated<br>by commas "," and around brackets.|String|(None)|2 and later|
|`recursive`|Optional.` true`: Recursively delete files<br>within a folder.` false`: Only delete first-<br>level file/folder. If a deleted folder<br>contains any file, an error will occur<br>because the folder can't be directly<br>deleted.|Boolean|true|2 and later|
|`search_taskid`|Optional. A unique ID for the search task<br>which is obtained from` start` method.<br>It's used to delete the file in the search<br>result.|Boolean|(None)|2 and later|


**Example:**









**Response:**


~~No specific response. It returns an empty success response if completed without error.~~


93 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

##### **_API Error Code_**

|Code|Description|
|---|---|
|`900`|Failed to delete file(s)/folder(s). More information in` <errors>` object.|



94 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Extract**~~

##### **_Description_**


Extract an archive and perform operations on archive files.


Note: Supported extensions of archives: zip, gz, tar, tgz, tbz, bz2, rar, 7z, iso.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 2

##### **_Method_** **start**


**Description:**


Start to extract an archive. This is a non-blocking method. You need to start to extract files with `start` method.

Then, you should poll requests with `status` method to get the progress status, or make a request with the `stop`

method to cancel the operation.


**Availability:**


Since version 2.


**Request:**


95 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

















|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`file_path`|A file path of an archive<br>to be extracted, starting<br>with a shared folder|String|(None)|2 and later|
|`dest_folder_path`|A destination folder<br>path starting with a<br>shared folder to which<br>the archive will be<br>extracted.|String|(None)|2 and later|
|`overwrite`|Optional. Whether or<br>not to overwrite if the<br>extracted file exists in<br>the destination folder.|Boolean|false|2 and later|
|`keep_dir`|Optional. Whether to<br>keep the folder<br>structure within an<br>archive.|Boolean|true|2 and later|
|`create_subfolder`|Optional. Whether to<br>create a subfolder with<br>an archive name which<br>archived files are<br>extracted to.|Boolean|false|2 and later|
|`codepage`|Optional. The language<br>codepage used for<br>decoding file name with<br>an archive.|DSM supported<br>language,<br>including enu, cht,<br>chs, krn, ger, fre,<br>ita, spn, jpn, dan,<br>nor, sve, nld, rus,<br>plk, ptb, ptg, hun,<br>trk or csy|DSM<br>Codepage<br>Setting|2 and later|
|`password`|Optional. The password<br>for extracting the file.|String|(None)|2 and later|
|`item_id`|Optional. Item IDs of<br>archived files used for<br>extracting files within an<br>archive, separated by a<br>comma ",". Item IDs<br>could be listed by<br>requesting` list`<br>method.|Integer|(None)|2 and later|


**Example:**









**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the extract task.|2|
|||||



96 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



**Example:**




##### **status**

**Description:**


Get the extract task status.


**Availability:**


Since version 2.


**Request:**

|Parameter|Description|Value|Default Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the extract task.|String|(None)|2 and later|



**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`finished`|Boolean|If the task is finished or not.|2|
|`progress`|Double|The extract progress expressed in range 0 to 1.|2|
|`dest_folder_path`|String|The requested destination folder for the task.|2|



**Example:**




##### **stop**

**Description:**


Stop the extract task.


**Availability:**


Since version 2.


97 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


**Request:**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the extract task which is obtained<br>from` start` method.|String|(None)|2 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **list**


**Description:**


List archived files contained in an archive.


**Availability:**


Since version 2.


**Request:**


98 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

















|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`file_path`|An archive file path<br>starting with a shared<br>folder to list.|String|(None)|2 and later|
|`offset`|Optional. Specify how<br>many archived files are<br>skipped before<br>beginning to return<br>listed archived files in<br>an archive.|Integer|0|2 and later|
|`limit`|Optional. Number of<br>archived files<br>requested. -1 indicates<br>to list all archived files<br>in an archive.|Integer|-1|2 and later|
|`sort_by`|Optional. Specify which<br>archived file information<br>to sort on.<br>Options include:<br>**name**: file name.<br>**size**: file size.<br>**pack_size**: file archived<br>size.<br>**mtime**: last modified<br>time.|name, size,<br>pack_size or mtime|name|2 and later|
|`sort_direction`|Optional. Specify to sort<br>ascending or to sort<br>descending.<br>Options include:<br>**asc**: sort ascending.<br>**desc**: sort descending.|asc or desc|asc|2 and later|
|`codepage`|Optional. The language<br>codepage used for<br>decoding file name with<br>an archive.|DSM supported<br>language, including<br>enu, cht, chs, krn,<br>ger, fre, ita, spn, jpn,<br>dan, nor, sve, nld,<br>rus, plk, ptb, ptg, hun,<br>trk or csy|DSM<br>Codepage<br>Setting|2 and later|
|`password`|Optional. The password<br>for extracting the file.|String|(None)|2 and later|
|`item_id`|Optional. Item ID of an<br>archived folder to be<br>listed within an archive.<br>(None) or -1 will list<br>archive files in a root<br>folder within an archive.|Integer|(None)|2 and later|


**Example:**









**Response:**


~~`<data>`~~ ~~object definitions:~~


99 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`items`|` <JSON-Style Array>`|Array of` <Archive_Item>` objects.|2|



`<Archive_Item Object>` definition:

|Member|Type|Description|Availability|
|---|---|---|---|
|`itemid`|Integer|Item ID of an archived file in an archive.|2 and later|
|`name`|String|Filename of an archived file in an archive.|2 and later|
|`size`|Integer|Original byte size of an archived file.|2 and later|
|`pack_size`|Integer|Archived byte size of an archived file.|2 and later|
|`mtime`|String|Last modified time of an archived file.|2 and later|
|`path`|String|Relative path of an archived file within in an archive.|2 and later|
|`is_dir`|Boolean|Whether an archived file is a folder.|2 and later|



**Example:**




##### **_API Error Code_**

100 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Code|Description|
|---|---|
|`1400`|Failed to extract files.|
|`1401`|Cannot open the file as archive.|
|`1402`|Failed to read archive data error|
|`1403`|Wrong password.|
|`1404`|Failed to get the file and dir list in an archive.|
|`1405`|Failed to find the item ID in an archive file.|



101 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.Compress**~~

##### **_Description_**


Compress file(s)/folder(s).


This is a non-blocking API. You need to start to compress files with the `start` method. Then, you should poll

requests with the `status` method to get compress status, or make a request with the `stop` method to cancel

the operation.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 3

##### **_Method_** **start**


**Description:**


Start to compress file(s)/folder(s).


**Availability:**


Since version 3.


**Request:**


102 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**













|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`path`|One or more file paths to be<br>compressed, separated by<br>commas "," and around brackets.<br>The path should start with a<br>shared folder.|String|(None)|3 and later|
|`dest_file_path`|A destination file path (including<br>file name) of an archive for the<br>compressed archive.|String|(None)|3 and later|
|`level`|Optional. Compress level used,<br>could be one of following values:<br>**moderate**: moderate compression<br>and normal compression speed.<br>**store**: pack files with no<br>compress.<br>**fastest**: fastest compression<br>speed but less compression.<br>**best**: slowest compression speed<br>but optimal compression.|moderate,<br>store,<br>fastest or<br>best|moderate|3 and later|
|`mode`|Optional. Compress mode used,<br>could be one of following values:<br>**add**: Update existing items and<br>add new files. If an archive does<br>not exist, a new one is created.<br>**update**: Update existing items if<br>newer on the file system and add<br>new files. If the archive does not<br>exist create a new archive.<br>**refreshen**: Update existing items<br>of an archive if newer on the file<br>system. Does not add new files to<br>the archive.<br>**synchronize**: Update older files in<br>the archive and add files that are<br>not already in the archive.|add, update,<br>refreshen or<br>synchronize|add|3 and later|
|`format`|Optional. The compress format,<br>ZIP or 7z format.|zip or 7z|zip|3 and later|
|`password`|Optional. The password for the<br>archive.|String|(None)|3 and later|


**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`taskid`|String|A unique ID for the compress task.|1|



**Example:**


103 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**




##### **status**

**Description:**


Get the compress task status.


**Availability:**


Since version 3.


**Request:**

|Parameter|Description|Value|Default Value|Availability|
|---|---|---|---|---|
|`taskid`|A unique ID for the compress task.|String|(None)|3 and later|



**Example:**





**Response:**


`<data>` object definitions:

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`finished`|Boolean|Whether or not the compress task is finished.|3|
|`dest_file_path`|String|The requested destination path of an archive.|3|



**Example:**




##### **stop**

**Description:**


Stop the compress task.


**Availability:**


Since version 3.


**Request:**


104 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`taskid`|A unique ID for the compress task which is<br>obtained from` start` method.|String|(None)|3 and later|



**Example:**





**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**

|Code|Description|
|---|---|
|`1300`|Failed to compress files/folders.|
|`1301`|Cannot create the archive because the given archive name is too long.|



105 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

## ~~**SYNO.FileStation.BackgroundTask**~~

##### **_Description_**


Get information regarding tasks of file operations which is run as the background process including copy, move,

delete, compress and extract tasks with non-blocking API/methods. You can use the `status` method to get more

information, or use the `stop` method to cancel these background tasks in individual API, such as

SYNO.FileStation.CopyMove API, SYNO.FileStation.Delete API, SYNO.FileStation.Extract API and

SYNO.FileStation.Compress API.

##### **_Overview_**


Availability: Since DSM 6.0


Version: 3

##### **_Method_** **list**


**Description:**


List all background tasks including copy, move, delete, compress and extract tasks.


**Availability:**


Since version 3.


**Request:**


106 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
||||||
|`offset`|Optional. Specify<br>how many<br>background tasks<br>are skipped before<br>beginning to return<br>listed background<br>tasks.|Integer|0|3 and later|
|`limit`|Optional. Number<br>of background<br>tasks requested. 0<br>indicates to list all<br>background tasks.|Integer|0|3 and later|
|`sort_by`|Optional. Specify<br>which information<br>of the background<br>task to sort on.<br>Options include:<br>**crtime**: creation<br>time of the<br>background task.<br>**finished**: Whether<br>the background<br>task is finished.|crtime or finished|crtime|3 and later|
|`sort_direction`|Optional. Specify<br>to sort ascending<br>or to sort<br>descending.<br>Options include:<br>**asc**: sort<br>ascending.<br>**desc**: sort<br>descending.|asc or desc|asc|3 and later|
|`api_filter`|Optional. List<br>background tasks<br>with one or more<br>given API<br>name(s),<br>separated by<br>commas "," and<br>around brackets. If<br>not given, all<br>background tasks<br>are listed.|SYNO.FileStation.CopyMove,<br>SYNO.FileStation.Delete,<br>SYNO.FileStation.Extract or<br>SYNO.FileStation.Compress|(None)|3 and later|


**Example:**













**Response:**


`<data>` object definitions:


107 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

|Parameter|Type|Description|Availability|
|---|---|---|---|
|`total`|Integer|Total number of background tasks.|3 and later|
|`offset`|Integer|Requested offset.|3 and later|
|`tasks`|` <JSON-Style Array>`|Array of` <background task>` objects.|3 and later|



`<background task>` object definition:

















|Parameter|Type|Description|Availability|
|---|---|---|---|
|`api`|String|Requested API name.|3 and later|
|`version`|String|Requested API version.|3 and later|
|`method`|String|Requested API method.|3 and later|
|`taskid`|String|A requested unique ID for the background task.|3 and later|
|`finished`|Boolean|Whether or not the background task is finished.|3 and later|
|`params`|JSON-Style<br>Object|` <params>` object. Requested parameters in<br>JSON format according to` start` method of<br>individual API of the background task.|3 and later|
|`path`|String|A requested path according to` start` method<br>of individual API of the background task.|3 and later|
|`processed_num`|Interger|A number of processed files according to the<br>response of` status` method of individual API<br>of the background task.|3 and later|
|`processed_size`|Interger|A processed byte size according to the<br>response of` status` method of individual API<br>of the background task.|3 and later|
|`processing_path`|String|A processing file path according to the<br>response of` status` method of individual API<br>of the background task.|3 and later|
|`total`|Interger|A total number/byte size according to the<br>response of` status` method of individual API<br>of the background task. If API doesn't support<br>it, the value is always -1.|3 and later|
|`progress`|Double|A progress value whose range between 0~1<br>according to the response of` status` method of<br>individual API of the background task. If API<br>doesn't support it, the value is always 0.|3 and later|
|`taskid`|` <favorite`<br>`additional>`<br>object|A unique ID according to the response of<br>` start` method of individual API of the<br>background task.|3 and later|


`<params>` object definition:





Requested parameters in JSON format. Please refer to `start` method in each API.


**Example:**


108 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
 {
    "tasks": [
 {
         "api": "SYNO.FileStation.CopyMove",
         "crtime": 1372926088,
         "finished": true,
         "method": "start",
         "params": {
           "accurate_progress": true,
           "dest_folder_path": "/video/test",
           "overwrite": true,
           "path": [
             "/video/test2/test.avi"
 ],
           "remove_src": false
 },
         "path": "/video/test2/test.avi",
         "processed_size": 12800,
         "processing_path": "/video/test2/test.avi",
         "progress": 1,
         "taskid": "FileStation_51D53088860DD653",
         "total": 12800,
         "version": 1
 },
 {
         "api": "SYNO.FileStation.Compress",
         "crtime": 1372926097,
         "finished": true,
         "method": "start",
         "params": {
           "dest_file_path": "/video/test/test.zip",
           "format": "zip",
           "level": "",
           "mode": "",
           "password": "",
           "path": [
             "/video/test/test.avi"
 ]
 },
         "progress": 0,
         "taskid": "FileStation_51D53091A82CD948",
         "total": -1,
         "version": 1
 },
 {
         "api": "SYNO.FileStation.Extract",
         "crtime": 1372926103,
         "finished": true,
         "method": "start",
         "params": {
           "create_subfolder": false,
           "dest_folder_path": "/video/test",
           "file_path": [
             "/video/test/test.zip"
 ],
           "keep_dir": true,
           "overwrite": false
 },
         "progress": 1,
         "taskid": "FileStation_51D530978633C014",
         "total": -1,
         "version": 1
 },
 {
         "api": "SYNO.FileStation.Delete",

```

109 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**

```
         "crtime": 1372926110,
         "finished": true,
         "method": "start",
         "params": {
           "accurate_progress": true,
           "path": [
             "/video/test/test.avi"
 ]
 },
         "path": "/video/test/test.avi",
         "processed_num": 1,
         "processing_path": "/video/test/test.avi",
         "progress": 1,
         "taskid": "FileStation_51D5309EE1E10BD9",
         "total": 1,
         "version": 1
 }
 ],
    "offset": 0,
    "total": 4
 }

##### **clear_finished**

```

**Description:**


Delete all finished background tasks.


**Availability:**


Since version 3.


**Request:**



|Parameter|Description|Value|Default<br>Value|Availability|
|---|---|---|---|---|
|`taskid`|Unique IDs of finished copy, move, delete,<br>compress or extract tasks. Specify multiple task<br>IDs by "," and around brackets. If it's not given, all<br>finished tasks are deleted.|String|(None)|3 and later|


**Example:**









**Response:**


No specific response. It returns an empty success response if completed without error.

##### **_API Error Code_**


No specific API error codes.


110 Copyright © Synology Inc. All Rights Reserved.


**Synology File Station Official API**


## ~~**Appendix A: Release Notes**~~

#### **Version 2023.03**

 Fix minor bugs


### **Version**


### **2021.03**



 Update API for DSM 7.0 release

 Fix minor bugs


### **Version**


### **2016.03**



 Update API for DSM 6.0 release


### **Version**


### **2013.08**



 Initial release


111 Copyright © Synology Inc. All Rights Reserved.


