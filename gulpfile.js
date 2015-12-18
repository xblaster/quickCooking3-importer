/*eslint-env node */
var gulp = require('gulp');
var gulpSequence = require('gulp-sequence');
var exec = require('gulp-exec');
var clean = require('gulp-clean');
var md5 = require('MD5');
var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var async = require("async");

var elasticHost = process.env.elasticHost || 'net.lo2k.net:9200';
var imageVolume = process.env.imageVolume || '/experimental/workdir';
var importVolume = process.env.importVolume || 'toImport';

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


//create imgDest dir if not exist
if (!fs.existsSync(imageVolume)) {
    fs.mkdirSync(imageVolume);
}


var paths = {
    pdf: 'workspace/**/*.pdf',
    images: 'workspace/**/*.jpg',
    texts: 'workspace/**/*.txt'
};

gulp.task('default', gulpSequence( 'handlePDF', 'elastic'))

gulp.task('watch', function() {

    return gulp.watch(paths.pdf, ['extractPDF']);
});

gulp.task('handlePDF', ['extractImages'], function() {})


gulp.task('importFromVolume', function() {
    gulp.src(importVolume + '/**/*')
        .pipe(gulp.dest('workspace/'));
        
});

gulp.task('clean', function() {
    gulp.src(paths.images).pipe(clean());
    gulp.src(paths.texts).pipe(clean());
});

gulp.task('extractPDF', function() {
    var options = {
        continueOnError: false, // default = false, true means don't emit error event 
        pipeStdout: false // default = false, true means stdout is written to file.contents 
        //customTemplatingThing: "test" // content passed to gutil.template() 
    };

    var reportOptions = {
        err: true, // default = true, false means don't write err 
        stderr: true, // default = true, false means don't write stderr 
        stdout: false // default = true, false means don't write stdout 
    }



    return gulp.src(paths.pdf)
        //.pipe(exec('convert -density 300 <%= file.path%> <%= file.path%>.jpg'))
        //.pipe(exec('convert -density 300 "<%= file.path%>" "<%= file.path%>.jpg"'))
        //-dNOPAUSE -dBATCH -sDEVICE=pdfwrite
        .pipe(exec('gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -dNumRenderingThreads=2 -r144 -sOutputFile="<%= file.path%>-p%03d.jpg" "<%= file.path%>"'))
        .pipe(exec.reporter(reportOptions))
        .on('finish', function() {
            gulp.src(paths.pdf)
                .pipe(gulp.dest('build/'))

            gulp.src(paths.pdf)
                .pipe(clean());
        });
});

gulp.task('extractImages', ['extractPDF'], function() {
    var options = {
        continueOnError: false, // default = false, true means don't emit error event 
        pipeStdout: false // default = false, true means stdout is written to file.contents 
        //customTemplatingThing: "test" // content passed to gutil.template() 
    };

    var reportOptions = {
        err: true, // default = true, false means don't write err 
        stderr: true, // default = true, false means don't write stderr 
        stdout: true // default = true, false means don't write stdout 
    };

    return gulp.src(paths.images)
        .pipe(exec('tesseract "<%= file.path%>" "<%= file.path%>" -l fra'))
        //.pipe(exec.reporter(reportOptions))
        .on('finish', function() {

            /*gulp.src(paths.images)
   			.pipe(gulp.dest('build/'))
   	
		   	gulp.src(paths.images)
		   	.pipe(clean());*/
        });
});

gulp.task('generateThumb', function(cb) {
	
	gulp.src(imageVolume+"/*.jpg") //#TODO from here 
	
})


//for debug purpose
gulp.task('restore', function() {
    gulp.src('build/**.pdf')
        .pipe(gulp.dest('workspace/'));

    gulp.src('build/**.*')
        .pipe(clean());
});







function sendToElastichSearch() {
    console.log("sendToElastic");
    var elasticsearch = require('elasticsearch');
    var client = new elasticsearch.Client({
        host: elasticHost
    });

    function readImageCb(file, buf, finishCb) {
        //init variables
        var text = file.contents.toString('UTF-8');
        var textfile = file.path;
        var picturefile = file.path.replace(".txt", "");
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
			im.resize({
	            srcPath: picturefile,
	            dstPath: imageVolume + "/"+qualityRef+"/" + checksum + ".jpg",
	            width: qualities[qualityRef].width
	        }, function(err, stdout, stderr) {
	           
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

        client.deleteByQuery({
            index: 'recipes',
            body: {
                "query": {
                    "term": {
                        checksum: checksum
                    }
                }
            }
        }, function(error, response) {
            console.log(response);
            create(); //create after deleting element with same checksum
        });


    }

    function startHandlingImage(file, cb) {
        file.contents = new Buffer(String(file.contents));
        var picturefile = file.path.replace(".txt", "");
        console.log("start handling " + picturefile);

        fs.readFile(picturefile, function(err, buf) {
            readImageCb(file, buf, cb);
        });
    }

    var queue = async.queue(startHandlingImage, 3); // Run three simultaneous handling


    // you're going to receive Vinyl files as chunks
    function transform(file, cb) {

        queue.push(file, function() {
            cb(null, file);
        });

    }
    return require('event-stream').map(transform);
}

gulp.task('elastic', [], function() {
    gulp.src(paths.texts)
        .pipe(sendToElastichSearch());

});

gulp.task('drop', function() {
    var elasticsearch = require('elasticsearch');
    var client = new elasticsearch.Client({
        host: elasticHost,
        log: 'trace'
    });

    client.indices.delete({
        index: 'recipes'
    });

    /*client.indices.delete({
        index: 'pictures'
    });*/

});

gulp.task('init', function() {
    var elasticsearch = require('elasticsearch');
    var client = new elasticsearch.Client({
        host: elasticHost,
        log: 'trace'
    });

    var body = {
        recipe: {
            properties: {
                content: {
                    "type": "string",
                    "analyzer": "french"
                }
            }
        }
    };

    client.indices.putMapping({
        type: "recipe",
        body: body
    });

    client.indices.create({
        index: 'recipes'
    });

    /*client.indices.create({
        index: 'pictures'
    });*/


});
