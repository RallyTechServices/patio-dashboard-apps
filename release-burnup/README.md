#Release Burnup

![ScreenShot](/images/release-burnup.png)

By default, the chart burns up all points or counts from all user stories and defects within the current project scope that meet one of the following criteria:

(1) Are descendants of ANY lowest level portfolio item CURRENTLY associated with the selected Release (note that the Portfolio Item may be outside of the current project scope.  Stories associated with that Portfolio Items outside of the current project scope will be included IF they are within the currently selected project scope).  
(2) Are directly associated with the release
(3) Defects not directly associated with the release will be included if they are associated with a User Story that falls within the dataset for (1) or (2).  

Only leaf stories (stories with no children) or defects are included in the dataset.  

This app can respond to a Release scoped Dashboard.  If the dashboard is timebox scoped (but not Release) or does not have a timebox scope, then a Release dropdown will be added to the app automatically.  

####App settings for this release include:
(1) Show Defects (default: true):  When unchecked, then no defects will be included in the burnup calculations on the chart.  
(2) Show Prediction Lines (default: true):  When unchecked, no prediction lines for Planned or Accepted points will be calculated or shown on the chart.  
(3) Show User Stories (default: true):  When unchecked, will only show defects.  Note that if both "Show Defects and Show User Stories" settings are unchecked, the chart will ignore this setting and default to showing User STories only.

This chart uses the lookback API to retrieve historical data for the user stories and defects.  

When retrieving user stories for the Portfolio Items associated with the release, the app will only look for user stories associated with the Portfolio Items that are in the release as of today.
If a portfolio Item was removed from the release yesterday, then any stories associated with that Portfolio Item not associated directly with the release will not be included in the historical dataset.  
  

## Development Notes

### First Load

If you've just downloaded this from github and you want to do development, 
you're going to need to have these installed:

 * node.js
 * grunt-cli
 * grunt-init
 
Since you're getting this from github, we assume you have the command line
version of git also installed.  If not, go get git.

If you have those three installed, just type this in the root directory here
to get set up to develop:

  npm install

### Structure

  * src/javascript:  All the JS files saved here will be compiled into the 
  target html file
  * src/style: All of the stylesheets saved here will be compiled into the 
  target html file
  * test/fast: Fast jasmine tests go here.  There should also be a helper 
  file that is loaded first for creating mocks and doing other shortcuts
  (fastHelper.js) **Tests should be in a file named <something>-spec.js**
  * test/slow: Slow jasmine tests go here.  There should also be a helper
  file that is loaded first for creating mocks and doing other shortcuts 
  (slowHelper.js) **Tests should be in a file named <something>-spec.js**
  * templates: This is where templates that are used to create the production
  and debug html files live.  The advantage of using these templates is that
  you can configure the behavior of the html around the JS.
  * config.json: This file contains the configuration settings necessary to
  create the debug and production html files.  
  * package.json: This file lists the dependencies for grunt
  * auth.json: This file should NOT be checked in.  Create this to create a
  debug version of the app, to run the slow test specs and/or to use grunt to
  install the app in your test environment.  It should look like:
    {
        "username":"you@company.com",
        "password":"secret",
        "server": "https://rally1.rallydev.com"
    }
  
### Usage of the grunt file
####Tasks
    
##### grunt debug

Use grunt debug to create the debug html file.  You only need to run this when you have added new files to
the src directories.

##### grunt build

Use grunt build to create the production html file.  We still have to copy the html file to a panel to test.

##### grunt test-fast

Use grunt test-fast to run the Jasmine tests in the fast directory.  Typically, the tests in the fast 
directory are more pure unit tests and do not need to connect to Rally.

##### grunt test-slow

Use grunt test-slow to run the Jasmine tests in the slow directory.  Typically, the tests in the slow
directory are more like integration tests in that they require connecting to Rally and interacting with
data.

##### grunt deploy

Use grunt deploy to build the deploy file and then install it into a new page/app in Rally.  It will create the page on the Home tab and then add a custom html app to the page.  The page will be named using the "name" key in the config.json file (with an asterisk prepended).

To use this task, you must create an auth.json file that contains the following keys:
{
    "username": "fred@fred.com",
    "password": "fredfredfred",
    "server": "https://us1.rallydev.com"
}

(Use your username and password, of course.)  NOTE: not sure why yet, but this task does not work against the demo environments.  Also, .gitignore is configured so that this file does not get committed.  Do not commit this file with a password in it!

When the first install is complete, the script will add the ObjectIDs of the page and panel to the auth.json file, so that it looks like this:

{
    "username": "fred@fred.com",
    "password": "fredfredfred",
    "server": "https://us1.rallydev.com",
    "pageOid": "52339218186",
    "panelOid": 52339218188
}

On subsequent installs, the script will write to this same page/app. Remove the
pageOid and panelOid lines to install in a new place.  CAUTION:  Currently, error checking is not enabled, so it will fail silently.

##### grunt watch

Run this to watch files (js and css).  When a file is saved, the task will automatically build and deploy as shown in the deploy section above.

