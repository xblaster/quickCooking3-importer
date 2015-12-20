/*eslint-env node */
var gulp = require('gulp');
var gulpSequence = require('gulp-sequence');
var md5 = require('MD5');
var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var async = require("async");
var chokidar = require('chokidar');
var ncp = require('ncp').ncp;
var path = require('path');
var exec = require('child_process').exec,
    child;

var elasticHost = process.env.elasticHost || 'net.lo2k.net:9200';
var imageVolume = process.env.imageVolume || '/experimental/workdir';
var importVolume = process.env.importVolume || '/import';


var workspace = "workspace";

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

var importIdentifier = guid();
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: elasticHost
});



/*************************************
 *  image part
 */



var resizeQueue = async.queue(function (params, callback) {
	
	console.log("resizing "+params.srcPath+" to => "+params.width);
	im.resize(params, function(err, stdout, stderr) {
          callback();
    });	
}, 3);

function readImageCb(file, buf, finishCb) {
    //init variables
    var text = buf.toString('UTF-8');
    var picturefile = file.replace(".txt", "");
    var checksum = md5(buf);
    var filename = path.basename(picturefile);

    //console.log("debuts vars == "+text+" "+textfile+" "+picturefile+" "+checksum+" "+filename);


    //copy to dest file
    fs.createReadStream(picturefile).pipe(fs.createWriteStream(imageVolume + "/" + checksum + ".jpg"));

	var qualities = {
	    p: {
	        width: 20
	    },
	    t: {
	        width: 40
	    },
	    m: {
	        width: 200
	    },
	    l: {
	        width: 800
	    }
	}

	for (var qualityRef in qualities) {
		try {
			fs.mkdirSync(imageVolume + "/"+qualityRef+"/" );
		}
		catch (exc) {
			//well, it doesn't matter !
		}
		
		resizeQueue.push({
            srcPath: picturefile,
            dstPath: imageVolume + "/"+qualityRef+"/" + checksum + ".jpg",
            width: qualities[qualityRef].width
        });
	}

   

    function create() {
        client.create({
            index: 'recipes',
            type: 'recipe',
            body: {
                content: text,
                checksum: checksum, 
                filename:  picturefile,
                importId: importIdentifier
            }
        }, function(error, response) {
            console.log("end handling " + picturefile);
            finishCb();
            //console.log(response);
        });
    }
    
    function removeAllFromResult(result) {
    	for (var i = 0; i < result.total; i++) {
			client.delete({
			  index: 'recipes',
			  type: 'recipe',
			  id: result.hits[i]._id
			}, function (error, response) {
				console.log("delete request response");
				console.log(response);
			});
    	}
    }

    client.search({
        index: 'recipes',
        body: {
            "query": {
                "term": {
                    checksum: checksum
                }
            }
        }
    }, function(error, response) {
		removeAllFromResult(response.hits);
        create(); //create after deleting element with same checksum
    });


}

function startHandlingText(file, cb) {
    var picturefile = file.replace(".txt", "");
    console.log("start handling " + picturefile);

    fs.readFile(file, function(err, buf) {
        readImageCb(file, buf, cb);
    });
}

/*******************************************************
 *  end image part
 */

    

//create queue

var queues = {};

queues.txt = async.queue(startHandlingText, 2); // Run three simultaneous handling

queues.pdf = async.queue(function (file, callback) {
	console.log('gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -dNumRenderingThreads=2 -r144 -sOutputFile="'+file+'-p%03d.jpg" "'+file+'"');
    //child = exec('gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -dNumRenderingThreads=2 -r144 -sOutputFile="<%= file>-p%03d.jpg" "<%= file%>"',
    child = exec('gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -dNumRenderingThreads=2 -r144 -sOutputFile="'+file+'-p%03d.jpg" "'+file+'"',
	  function (error, stdout, stderr) {
	    console.log('stderr: ' + stderr);
	    callback();
	});
}, 2);

queues.jpg = async.queue(function (file, callback) {
	console.log('tesseract "'+file+'" "'+file+'" -l fra');
    //child = exec('gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -dNumRenderingThreads=2 -r144 -sOutputFile="<%= file>-p%03d.jpg" "<%= file%>"',
    child = exec('tesseract "'+file+'" "'+file+'" -l fra',
	  function (error, stdout, stderr) {
	    console.log('stderr: ' + stderr);
	    callback();
	});
}, 2);


function handleFile(file) {
	var path = require('path')
	var extension = path.extname(file).toLowerCase();
	
	if (extension === ".pdf") {
		queues.pdf.push(file);
	} 
	
	if (extension === ".jpg") {
		queues.jpg.push(file);
	}
	
	if (extension === ".txt") {
		queues.txt.push(file);
	}
}

function watchWorkspace() {
var watcher = chokidar.watch(workspace, {ignored: /^\./, persistent: true});

	var end_timeout = 1000;
	
	watcher
	    .on('add', function(path) {
	
	        //console.log('File', path, 'has been added');
	
	        fs.stat(path, function (err, stat) {
	            // Replace error checking with something appropriate for your app.
	            if (err) throw err;
	            setTimeout(checkEnd, end_timeout, path, stat);
	        });
	});
	
	function checkEnd(path, prev) {
	    fs.stat(path, function (err, stat) {
	
	        // Replace error checking with something appropriate for your app.
	        if (err) throw err;
	        if (stat.mtime.getTime() === prev.mtime.getTime()) {
	            console.log(path+ " finished");
	            // Move on: call whatever needs to be called to process the file.
				handleFile(path);
	        }
	        else
	            setTimeout(checkEnd, end_timeout, path, stat);
	    });
	}
}


function importFiles() {
	ncp(importVolume, workspace, function (err) {
	 if (err) {
	   return console.error(err);
	 }
	 console.log('import done!');
	});
    
}


watchWorkspace();
importFiles();
