/**
Copyright (c) 2014 Vox Media Inc., KK Rebecca Lai, Nicole Zhu, Adam Baumgartner

BSD license

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 1) Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

 2) Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

 3) Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

QuizGenerator_flowchart = function () {
    // make sure to attach json object 'var input' with quiz data, and define 'var pubStylesheet'

    // variables
    var slug, currentRow, connectsTo, currentSlug, pub, number, lastRow;
    var questionNumber = 0;
    var separator = ",";

    var pageScroll = function (target) {
        $('html,body').scrollTop($(target).offset().top - 30);
    };

    // get next slug to build question, disable previous question's buttons
    var getSlug = function (newslug, selection) {
        $selection = $(selection);
        $selection.addClass('flowchart-selected');
        trackEvent(
            'q' + questionNumber + '-selected-' + $selection.data('question-choice'),
            'Q' + questionNumber + ' selected ' + $selection.data('question-choice'));
        var parent = ($selection.parent());
        var moveArrow = $selection.position().left + 55;
        $(parent).after('<div style="position:absolute; left:' + moveArrow + 'px;" class="arrow-down">&darr;</div>');
        $('.flowchart-button').attr('disabled', true);
        slug = newslug;
        buildQuestion(slug);
    };

    // clean slug
    var cleanSlug = function (slug) {
        slug = slug.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return slug;
    };

    var compareSlug = function (slug) {
        for (var i = 0; i < input.length; i++) {
            currentSlug = cleanSlug(input[i].slug);
            if (currentSlug == slug) {
                currentRow = i;
                break;
            }
        }
    };

    // build question in flowchart - scrolldown enabled for all questions except the last one
    var buildQuestion = function (slug) {
        compareSlug(slug);

        var questionDiv = "";
        var elementType = "h1";
        if (input[currentRow].connectsto == "End") {
            elementType = "h3";
        }
        $(".quiz-container").append("<div class='question-" + questionNumber + "'><" + elementType + " class='question'>" + input[currentRow].text + "</" + elementType + "></div>");

        if (currentRow !== 0) {
            if ($(window).width() > 500) {
                $(".question-" + (questionNumber)).css("display", "none");
                $(".question-" + (questionNumber)).fadeIn('slow');
            }
        }
        pageScroll($(".question-" + (questionNumber)));
        writeOptions(currentRow);
        trackEvent('q' + questionNumber + '-displayed', 'Q' + questionNumber + ' displayed');
    };

    // write possible options to each question, handles multiple options
    var writeOptions = function (currentRow) {
        var row = input[currentRow];
        var connectsLabels = row.connectstext.split(separator);
        connectsTo = row.connectsto.split(separator);
        if (connectsTo[0] == 'End') {
            $('.question-' + questionNumber).fadeIn(400);
            lastQuestion();
        } else {
            for (var i = 0; i < connectsLabels.length; i++) {
                $('.question-' + questionNumber).append("<button class='flowchart-button qq-button button choice-" + questionNumber + "-" + i + "' data-question-choice='choice-" + questionNumber + "-" + i + "'>" + connectsLabels[i] + "</button>");
                $('.choice-' + questionNumber + '-' + i).on('click', getClass);
            }
            $('.question-' + questionNumber).fadeIn(400);
            questionNumber++;
        }
    };

    var getClass = function () {
        var classes = $(this).attr('class').split(' ');
        number = classes[classes.length - 1].split('-');
        getSlug(cleanSlug(connectsTo[number[number.length - 1]]), this);
    };

    // handles last question and social media sharing buttons
    var lastQuestion = function () {
        for (var i = 0; i < input.length; i++) {
            input[i].slug = cleanSlug(input[i].slug);
            if (input[i].slug == 'end') {
                lastRow = i;
                break;
            }
        }
        $('.question-' + questionNumber).append('<div class="last"><p>' + input[lastRow].text + '</p>');
        $('.quiz-container').append('<button class="flowchart-button qq-button button restart">Restart</button></div>');
        trackEvent('completed', 'Flowchart completed');
        $('.restart').on('click', restart);
    };

    // restarts flowchart from beginning
    var restart = function () {
        $('.quiz-container').empty();
        pageScroll('.quiz-container');
        questionNumber = 0;
        slug = input[0].slug;
        buildQuestion(slug);
        trackEvent('restart', 'Flowchart restarted');
    };

    function trackEvent(action, label) {
        if (typeof (ga) != 'undefined') {
            ga('send', 'event', 'flowchart', action, label);
        } else if (typeof (_gaq) != 'undefined') {
            _gaq.push($.merge(['_trackEvent', 'flowchart'], arguments));
        }
    }

    $(document).ready(function () {
        trackEvent('loaded', 'Quiz is loaded');
        slug = input[0].slug;
        slug = cleanSlug(slug);
        buildQuestion(slug);
    });

};

$(function() {
    QuizGenerator_flowchart()
});