///ts:ref=globals
/// <reference path="../globals.ts"/> ///ts:ref:generated

///ts:import=messages
import messages = require('./messages'); ///ts:import:generated
///ts:import=programManager
import programManager = require('../main/lang/programManager'); ///ts:import:generated

import childprocess = require('child_process');
import os = require('os');
var exec = childprocess.exec;
var spawn = childprocess.spawn;

var child: childprocess.ChildProcess;
var currentListeners: { [messages: string]: { [id: string]: PromiseDeferred<any> } } = {};
export function startWorker() {
    try {
        var env = Object.create(process.env);
        env.ATOM_SHELL_INTERNAL_RUN_AS_NODE = '1';

        var node = os.platform() === 'win32' ? "node" : process.execPath;

        child = spawn(node, [
            // '--debug', // Uncomment if you want to debug the child process
            __dirname + '/workerProcess.js',
        ], { env:env, stdio:['ipc']  });

        child.on('error',(err) => {
            console.log('CHILD ERR:', err.toString());
            child = null;
        });

        console.log('ts worker started');
        function processResponse(m: any) {
            var parsed: messages.Message<any> = m;

            if (!parsed.message || !parsed.id) {
                console.log('PARENT ERR: Invalid JSON data from child:', m);
            }
            if (!currentListeners[parsed.message] || !currentListeners[parsed.message][parsed.id]) {
                console.log('PARENT ERR: No one was listening:', parsed.message, parsed.data);
                return;
            }
            else {
                currentListeners[parsed.message][parsed.id].resolve(parsed.data);
                delete currentListeners[parsed.message][parsed.id];
            }
        }

        child.on('message',(resp)=>processResponse(resp));


        child.stderr.on('data',(err) => {
            console.log("CHILD ERR:", err.toString());
        });
        child.on('close',(code) => {
            // Handle process dropping
            console.log('ts worker exited with code:', code);

            // If orphaned then Definitely restart
            if (code === messages.orphanExitCode) {
                console.log('ts worker restarting');
                startWorker();
            }
            // probably restart even otherwise. Potential infinite loop.
            else if (code !== /* ENOENT? */ -2) {
                console.log('ts worker restarting');
                startWorker();
            }
            else {
                showError();
            }
        });
    }
    catch (ex) {
        showError(ex);
    }
}

export function stopWorker() {
    if (!child) return;
    try {
        child.kill('SIGTERM');
    }
    catch (ex) {
        console.error('failed to kill worker child');
    }
    child = null;
}

// Creates a Guid (UUID v4)
function createId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function query<Query, Response>(message: string, data: Query): Promise<Response> {

    // If we don't have a child exit
    if (!child) {
        console.log('PARENT ERR: no child when you tried to send :', message);
        return;
    }

    // Initialize if this is the first call of this type
    if (!currentListeners[message]) currentListeners[message] = {};

    // Create an id unique to this call and store the defered against it
    var id = createId();
    var defer = Promise.defer();
    currentListeners[message][id] = defer;

    // Send data to worker
    child.send({ message: message, id: id, data: data });
    return defer.promise;
}

export interface Exec<Query, Response> {
    (data: Query): Promise<Response>;
}

function showError(error?: Error) {
    atom.notifications.addError("Failed to start a child TypeScript worker. Atom-TypeScript is disabled.")
    if (error) {
        console.error('Failed to activate ts-worker:', error);
    }
}

/////////////////////////////////////// END INFRASTRUCTURE ////////////////////////////////////////////////////


export var echo: Exec<messages.EchoQuery, messages.EchoResponse>
    = (data) => query(messages.echo, data);

export var updateText: Exec<messages.UpdateTextQuery, messages.EchoResponse>
    = (data) => query(messages.updateText, data);

export var getErrorsForFile: Exec<messages.GetErrorsForFileQuery, messages.GetErrorsForFileResponse>
    = (data) => query(messages.getErrorsForFile, data);

// TODO: push this code in "query" once we have all the functions updated
function getExecutorOnChild<Query,Response>(func:(query:Query)=>Response): (data:Query) => Promise<Response>{
    return (data) => query(func.name, data);
}

export var quickInfo = getExecutorOnChild(programManager.quickInfo);
export var build = getExecutorOnChild(programManager.build);
export var errorsForFileFiltered = getExecutorOnChild(programManager.errorsForFileFiltered);
export var getCompletionsAtPosition = getExecutorOnChild(programManager.getCompletionsAtPosition);
export var emitFile = getExecutorOnChild(programManager.emitFile);
export var formatDocument = getExecutorOnChild(programManager.formatDocument);
export var formatDocumentRange = getExecutorOnChild(programManager.formatDocumentRange);
export var getDefinitionsAtPosition = getExecutorOnChild(programManager.getDefinitionsAtPosition);
