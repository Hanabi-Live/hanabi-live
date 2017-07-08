let myObj = {
	poop: 'fart',
	poop1: 'asdf',
	asdf: 'qwer',
};
Object.entries(myObj).forEach(function([key, val]) {
    console.log(key);          // the name of the current key.
    console.log(val);          // the value of the current key.
});
