The goal is to help people to use AI-assisted programming tools effectively (like Cursor, Claude Code).


Sharp Tools helps programmers to use AI-assisted tools (like Claude Code and Cursor) more effectively, by getting a nicely-digested readout of the changes being made by the AI in realtime.



watch what the AI is doing as it codes, and get a summary that we can interrupt

“What if you had an AI that not only wrote code, but explained what it was doing, showed you why, and even corrected itself?

GD I’m going to vote that it *shouldn’t* correct itself, because that’s out of scope. It provides *you* (the coder/manager) with the information to understand & intervene

“Correcting itself” here is I think much easier than it sounds … e.g. you get surprisingly good results by stopping Claude and just saying “do better” (without even saying what it did badly). So … it having access to actual insights I would expect it to make good use of without us really doing any effort.

GD could ‘correcting itself’ be a v2?

GD story

I’m an experienced programmer. I’ve asked the LLM to do something, and I want to make sure it’s doing things the right way, and to interrupt if it goes off the rails.

I run `npx llm-babysitter` in the background

I write a prompt in Cursor, and then the LLM starts whirring

- I open up the browser window, and watch a summary that updates, of what the LLM is doing
    
    *The goal here is to implement your planning doc X.*
    
    *The LLM has changed the following N files. Here's a summary of the change made to each.*
    
    *It has made the following decisions along the way that weren’t explicitly defined in your prompt.*
    
    *Here’s a diagram showing the structure of the changes it has made.*
    

the key is it’s about building a mental model of what’s being changed, not evaluating whether the code is different

What does this look like? What do you see? worked example?

changes to types —> shows a visual datamodel change

![chrome_72NLBKptvu.png](attachment:99a1a063-e75d-46e5-897b-141c2dea14c0:chrome_72NLBKptvu.png)

→

![chrome_wXWhEk7xld.png](attachment:478085b7-8da3-46f8-bd8d-9bb216813d4b:chrome_wXWhEk7xld.png)

Set of files that changed —> shows additions and removals proportionate to how big and how many

![image.png](attachment:5cf91bb9-4171-4686-a54e-757a41b31897:image.png)

Use of Design Patterns —> shows green/amber/red summaries of which design patterns are being used in the current diff-set

1. an icon for any input docs (MD files planning)
2. thumbnails for individual file diffs
3. a mini checklist that is being updated

Make it visual, interactive

Try to really reduce/manage the human programmer's cognitive load. Start with summaries/digests, that you can click on for more information.

Chat info