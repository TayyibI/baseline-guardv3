function oldStringMethods() {
    let text = "hello world";
    console.log(text.big());     // Should be flagged
    console.log(text.blink());   // Should be flagged
    console.log(text.bold());    // Should be flagged
}

// 2. Deprecated Array Method (Firefox only)
function oldArrayMethod() {
    let arr = [1, 2, 3];
    console.log(arr.toSource()); // Non-standard, should be flagged
}

// 3. Document Writing (Harmful practice)
function badDocumentPractice() {
    document.write("This blocks rendering!"); // Should be flagged
}

// 4. Legacy DOM (Creating elements with attributes)
function legacyDOM() {
    let badElement = document.createElement("<p id='myId'>"); // Non-standard
}

// 5. Global namespace pollution
var globalPolluter = "This pollutes the global scope"; // Should be flagged

oldStringMethods();
oldArrayMethod();
badDocumentPractice();
legacyDOM();