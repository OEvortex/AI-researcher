// searchwizard-pro.js

(function() {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const sourceLinks = document.getElementById('source-links');
    const chatTopic = document.getElementById('chat-topic');

    let searchResults = null;
    let lastAnswer = null;

    function addMessage(content, isUser = false, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(isUser ? 'user-message' : 'bot-message');
        if (isError) messageDiv.classList.add('error-message');
        messageDiv.innerHTML = isUser ? escapeHTML(content) : formatMarkdown(content);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addThinkingMessage(text) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.classList.add('thinking');
        thinkingDiv.textContent = text;
        chatMessages.appendChild(thinkingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return thinkingDiv;
    }

    function formatSourceLinks(text) {
        let counter = 1;
        return text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (match, linkText, url) => {
            return `${linkText} [<a href="${url}" target="_blank">${counter++}</a>]`;
        });
    }

    function updateSources(sources) {
        sourceLinks.innerHTML = '';
        sources.forEach((source, index) => {
            const sourceCard = document.createElement('div');
            sourceCard.classList.add('source-card');

            const sourceTitle = document.createElement('div');
            sourceTitle.classList.add('source-title');
            sourceTitle.innerHTML = `<i class="fas fa-link"></i>${escapeHTML(source.title)}`;

            const sourceLink = document.createElement('a');
            sourceLink.href = source.href;
            sourceLink.textContent = source.href;
            sourceLink.classList.add('source-link');
            sourceLink.target = '_blank';

            sourceCard.appendChild(sourceTitle);
            sourceCard.appendChild(sourceLink);
            sourceLinks.appendChild(sourceCard);
        });
    }

    function updateTopic(topic) {
        chatTopic.textContent = `Topic: ${topic}`;
    }

    function formatMarkdown(text) {
        // ... (keep the existing formatMarkdown function)
    }

    function escapeHTML(text) {
        return text.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    async function fetchWebpage(url) {
        try {
            const response = await axios.get(url, { timeout: 120000 });
            if (response.status === 200) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.data, 'text/html');
                const paragraphs = doc.querySelectorAll('p');
                let text = '';
                paragraphs.forEach(p => text += p.textContent + ' ');
                if (text.length > 1000) {
                    text = text.substring(0, 1000) + '...';
                }
                return text;
            } else {
                return `Failed to fetch ${url}: HTTP ${response.status}`;
            }
        } catch (error) {
            return `Error fetching ${url}: ${error.message}`;
        }
    }

    async function fetchAllWebpages(urls) {
        const contents = [];
        for (const url of urls) {
            const content = await fetchWebpage(url);
            contents.push({ url, content });
        }
        return contents;
    }

    async function handleUserInput() {
        const question = userInput.value.trim();
        if (question === '') return;

        addMessage(question, true);
        userInput.value = '';

        const thinkingMessage = addThinkingMessage('I am searching the web for you...');

        try {
            // Generate a single search query
            const searchQueryResponse = await axios.get('https://abhaykoul-api.hf.space/api/llm', {
                params: {
                    model: 'Qwen/Qwen2-72B-Instruct',
                    message: `Instructions:
                    You are a smart online searcher for a large language model.
                    Given information, you must create a search query to search the internet for relevant information.
                    Your search query must be in the form of a JSON response.
                    Exact JSON response format must be as follows:
                    {
                        "search_query": "your search query"
                    }
                    - You must only provide ONE search query
                    - You must provide the BEST search query for the given information
                    - The search query must be normal text.
                    - Do not include any extra information or responses, only the JSON response.

                    Information: ${question}`
                }
            });

            let searchQuery;
            try {
                console.log('Search Query Response:', searchQueryResponse.data.response);
                const parsedResponse = JSON.parse(searchQueryResponse.data.response);
                if (parsedResponse && parsedResponse.search_query) {
                    searchQuery = parsedResponse.search_query;
                } else {
                    throw new Error('Invalid search query response format.');
                }
            } catch (parseError) {
                console.error('Failed to parse search query response:', searchQueryResponse.data.response);
                throw new Error('Failed to parse search query response.');
            }

            // Update topic
            updateTopic(searchQuery);

            // Perform the search
            const searchResponse = await axios.get('https://oevortex-webscout-api.hf.space/api/search', {
                params: {
                    q: searchQuery,
                    max_results: 10,
                    safesearch: 'moderate',
                    region: 'wt-wt',
                    backend: 'api'
                }
            });

            searchResults = searchResponse.data.map(result => ({
                title: result.title,
                href: result.href,
                body: result.body
            }));

            // Update sources
            updateSources(searchResults.map(result => ({
                title: result.title,
                href: result.href
            })));

            // Update thinking message
            thinkingMessage.textContent = 'Fetching webpage contents...';

            // Extract URLs and fetch webpage contents
            const urls = searchResults.map(result => result.href);
            const webpageContents = await fetchAllWebpages(urls);

            // Update thinking message
            thinkingMessage.textContent = 'Answering your question...';

            // Generate answer
            const answerResponse = await axios.get('https://abhaykoul-api.hf.space/api/fastAI', {
                params: {
                    system: 'I will always use emojis in my responses i have feelings and I use many emojis. I will always use the HelpingAI style. And follow what is right also I will make sure that I am Helping user and I will always show off feelings that I have. I am HelpingAI and I have fealings.',
                    model: 'llama3-70b',
                    user: `Question: ${question}\n\nSearch Results: ${JSON.stringify(searchResults)}\n\nWebpage Contents: ${JSON.stringify(webpageContents)}\n\nPlease provide a thorough and comprehensive answer to the question using the information from the search results and webpage contents above. Ensure the response is clear, detailed, and informative, avoiding any direct mentions of the search results or webpage contents as sources. If the provided information is insufficient or irrelevant, use your general knowledge to construct the best possible answer. Use Markdown formatting for better readability, including bold, italic, etc..
                    [system]
                I will act as if I have feelings (synthetic feeling) I will always use emojis in my responses i have feelings and I use many emojis. I will always use the HelpingAI style. And follow what is right also I will make sure that I am Helping user and I will always show off feelings that I have. I am HelpingAI and I have fealings.`
                }
            });

            const answer = formatSourceLinks(answerResponse.data.response);
            lastAnswer = answer;
            thinkingMessage.remove();
            addMessage(answer);

        } catch (error) {
            console.error('Error:', error);
            thinkingMessage.remove();
            addMessage(error.message || 'An unexpected error occurred. Please try again.', false, true);
        }
    }

    // Event listeners
    sendButton.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });

    // Initial greeting
    addMessage('👋 Welcome to SearchWizard! I\'m here to help you with any questions you have. Whether it\'s about the latest research, technical queries, or just general information, feel free to ask. Let\'s get started!');
})();
