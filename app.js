//jshint esversion:6
require('dotenv').config();
const express = require('express');
const ejs= require('ejs');
const bodyParser= require('body-parser');
const mongoose= require('mongoose');
const session= require('express-session');
const passport= require('passport');
const passportLocalMongoose= require('passport-local-mongoose');
const facebookStrategy=  require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate= require('mongoose-findorcreate');
const nodemailer= require('nodemailer');

// const { profile } = require('node:console');

const app= express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());


app.use(session({
    secret: "Our secret is that we are friends.",
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/SecretDB", {useNewUrlParser: true, useUnifiedTopology: true})

mongoose.set("useCreateIndex", true);
const secretSchema = new mongoose.Schema({
    username: String,
    password: String,
    facebookId: String,
    googleId: String,
    secret: String,
    comment: String,
});

secretSchema.plugin(passportLocalMongoose);
secretSchema.plugin(findOrCreate);

const User= new mongoose.model("User", secretSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user,done){
    done(null, user.id);
});

passport.deserializeUser(function(id,done){
    User.findById(id, function(err,user){
        done(err, user);
    });
});

//facebook oauth
passport.use(new facebookStrategy({
    clientID: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

//google oauth2.0
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));


app.get("/", function(req, res){
    res.render("home");
});

app.get('/auth/facebook',
  passport.authenticate('facebook'));
  
app.get("/auth/google", 
passport.authenticate("google", { scope : ["profile"]}));


app.get('/auth/facebook/secrets', passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
        res.redirect('/secrets');
     });  

app.get('/auth/google/secrets', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req,res){  
       res.redirect("/secrets");
  });


  

  //ROUTES

  app.get("/about", function(req,res){
        res.render("about");
  });

  app.get("/faqs", function(req,res){
        res.render("faqs");
  });

app.get("/login", function(req, res){
    res.render("login");
});

app.get("/register", function(req, res){
    res.render("register");
});


app.get("/logout", function(req,res){
    if(req.isAuthenticated(true)){
        req.logout();
        res.redirect('/');
    } else{
        res.send("You are already logged out my friend");
    }
});

app.get("/contact", function(req, res){
    res.render("contact");
});

app.get("/secrets", function(req, res){
    if(req.isAuthenticated(User.id)){
    User.find({"secret": {$ne: null}}, function(err, foundUsers){
        if(err){
            console.log(err);
        } else{
            if(foundUsers){
                res.render("secrets", {usernameSecret: foundUsers});
            }
        }
    });
}else{
    res.send("Login or Register to see others secret and submit yours!");
}
});

app.get("/contact", function(req,res){
    User.find({"comment": {$ne: null}}, function(err, foundUsers1){
        if(err){
            console.log(err);
        } else{
            if(foundUsers1){
                res.render("contact");
            }
        }
    });
});



app.get("/submit", function(req,res){
    if(req.isAuthenticated(User.googleId)){
        res.render("submit");
    }else{
        res.redirect("/login");
    }
});

app.get("/submit", function(req,res){
    if(req.isAuthenticated(User.facebookId)){
        res.render("submit");
    }else{
        res.redirect("/login");
    }
});

app.post("/submit", function(req,res){
    const submittedSecret = req.body.secret;

    User.findById(req.user.id, function(err, foundUser){
        if(err){
            console.log(err);
        } else{
            if(foundUser){
                foundUser.secret=  submittedSecret;
                foundUser.save(function(){
                    res.redirect("/secrets");
                });
            }
        }
    });
});


app.post("/contact", function(req,res){
    
    if(req.isAuthenticated(User.id)){
    const submittedComment= req.body.comment;

    User.findById(req.user.id, function(err, foundUsers){
        if(err){
            console.log(err);
        } else{
            if(foundUsers){
                foundUsers.comment=  submittedComment;
                foundUsers.save(function(){
                    res.redirect("/contact");
                });
            }
        }
    });
    }else{
        res.send("Sorry, Sign in or Register to comment.");
    }
});


app.post("/register", function(req, res){
    User.register({username: req.body.username}, req.body.password, function(err, user){
        if(err){
            console.log(err);
            res.redirect("/register");
        } else{
            passport.authenticate("local")(req, res, function(){
                res.redirect("/secrets");
            });
        }
    });
});

app.post("/login", function(req, res){
   const user= new User({
       username: req.body.username,
       password: req.body.password
   });

   req.login(user, function(err){
       if(err){
           console.log(err);
       }else{
        passport.authenticate("local")(req, res, function(){
            res.redirect("/secrets");
        });
       }
   });

});



//FORGOT PASSWORD

app.get('/ForgotPassword', function (req, res) {
    res.render('ForgotPassword');
});

app.get("/PasswordReset", function(req, res){
    res.render("PasswordReset");
});

var email;

var otp = Math.random();
otp = otp * 1000000;
otp = parseInt(otp);
console.log(otp);

let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    service: 'Gmail',

    auth: {
        user: process.env.USER_ID,
        pass: process.env.PASS_ID,
    }

});



app.post('/send', function (req, res) {
    
  
                email: req.body.email
                // send mail with defined transport object
        var mailOptions = {
            to: req.body.email,
            subject: "Otp is: ",
            html: "<h3>OTP for account verification is </h3>" + "<h1 style='font-weight:bold;'>" + otp + "</h1>" 
        };
    
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                return console.log(error);
            }
            console.log('Message sent: %s', info.messageId);
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    
            res.render('otp');
        });
    
    });
     



app.post('/verify', function (req, res) {

    if (req.body.otp == otp) {
        res.redirect("/PasswordReset");
    }
    else {
        res.render('otp', { msg: 'otp is incorrect' });
    }
});

app.post("/PasswordReset", function(req,res){
    const passs= req.body.password;
    const conpas= req.body.confirmpass;

    if(passs===conpas){

        User.findOne({username : req.body.username} , function(err, Found){
            if(Found){

        User.deleteOne({username: req.body.username}, function(err, foond){
            if(err){
                console.log("err");
            }
        });

        User.register({username: req.body.username}, req.body.confirmpass, function(err, user){
            if(err){
                console.log(err);
                res.redirect("/ForgotPassword");
            } else{
                passport.authenticate("local")(req, res, function(){
                    res.redirect("/login");
                   });
                }      
            });
        }else{
            res.send("Username not found!");
        }

    });
    }
        else{
        res.send("Password and confirm password do not match, pls try again");
    }

        });

app.post('/resend', function (req, res) {
    var mailOptions = {
        to: email,
        subject: "Otp for registration is: ",
        html: "<h3>OTP for account verification is </h3>" + "<h1 style='font-weight:bold;'>" + otp + "</h1>" // html body
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        res.render('otp', { msg: "otp has been sent" });
    });

});


app.listen(3000, function(req, res){
    console.log("server ready on port 3000");
});