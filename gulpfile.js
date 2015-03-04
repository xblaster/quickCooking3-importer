var gulp = require('gulp');
var gutil = require('gulp-util');
var exec = require('gulp-exec');
var clean = require('gulp-clean');


var paths = {
	pdf: 	'workspace/**.pdf',
	images: 'workspace/**.jpg',
	texts: 'workspace/**.txt'
};

gulp.task('default', ['handlePDF']);

gulp.task('watch', function() {

	return gulp.watch(paths.pdf, ['extractPDF']);
});

gulp.task('handlePDF', ['clean','extractImages'], function() {
})


gulp.task('clean', function() {
	gulp.src(paths.images).pipe(clean());
	return gulp.src(paths.texts).pipe(clean());
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
	    stdout: true // default = true, false means don't write stdout 
	}



	return gulp.src(paths.pdf)
	.pipe(exec('convert -density 300 <%= file.path%> <%= file.path%>.jpg'))    
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
	}

	return gulp.src(paths.images)
	.pipe(exec('tesseract <%= file.path%> <%= file.path%> -l eng'))    
    //.pipe(exec.reporter(reportOptions))
    .on('finish', function() {
            /*gulp.src(paths.images)
   			.pipe(gulp.dest('build/'))
   	
		   	gulp.src(paths.images)
		   	.pipe(clean());*/
		   });
});

//for debug purpose
gulp.task('restore', function() {
	gulp.src('build/**.pdf')
	.pipe(gulp.dest('workspace/'));

	gulp.src('build/**.*')
	.pipe(clean());
});


function sendToElastichSearch() {
	var elasticsearch = require('elasticsearch');
	var client = new elasticsearch.Client({
		host: 'localhost:9200',
		log: 'trace'
	});

  // you're going to receive Vinyl files as chunks
  function transform(file, cb) {
    // read and modify file contents
    file.contents = new Buffer(String(file.contents));

    var text = file.contents.toString('UTF-8');
    var filename = file.path;
    var picturefile = file.path.replace(".txt","");

    var filename = path.filename(file.path);


    console.log();
    console.log("============");
    console.log(file.path);

 	/*client.create({
    	index: 'myindex',
    	type: 'mytype',
    	body: {
    		title: 'Test 1',
    		tags: ['y', 'z'],
    		published: true,
    		published_at: '2013-01-01',
    		counter: 1,
    		//content: file.contents
    	}
    }, function (error, response) {
    	console.log(response);
    });*/

cb(null, file);


}
return require('event-stream').map(transform);
}

gulp.task('elastic', [], function() {
	


	gulp.src(paths.texts)
	.pipe(sendToElastichSearch());

});


