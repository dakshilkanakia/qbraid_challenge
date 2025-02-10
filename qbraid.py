import tkinter as tk
from tkinter import ttk
import requests
import re
from threading import Thread
import logging
import os
from datetime import datetime

# Set up logging
def setup_logging():
    """Configure logging settings"""
    # Create logs directory if it doesn't exist
    if not os.path.exists('logs'):
        os.makedirs('logs')
    
    # Create log filename with timestamp
    log_filename = f'logs/qbraid_chat_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] - %(message)s',
        handlers=[
            logging.FileHandler(log_filename),
            logging.StreamHandler()
        ]
    )
    
    logging.info("Application started")
    return log_filename

# Global variables
api_key = None
root = None
chat_frame = None
status_label = None
chat_display = None
prompt_entry = None
model_dropdown = None
log_filename = setup_logging()

def validate_api_key(event=None):
    """Validate API key format and fetch models if valid"""
    global api_key
    entered_key = api_key_entry.get().strip()
    
    logging.info("Validating API key")
    if len(entered_key) == 30 and re.match(r'^[a-z0-9]+$', entered_key):
        api_key = entered_key
        logging.info("API key validation successful")
        Thread(target=fetch_models).start()
    else:
        logging.warning(f"Invalid API key format: length={len(entered_key)}")
        chat_frame.grid_remove()
        status_label.config(text="Invalid API key format. Must be 30 characters.")

def fetch_models():
    """Fetch available models from qBraid API"""
    try:
        url = "https://api.qbraid.com/api/chat/models"
        headers = {"api-key": api_key}
        
        logging.info("Fetching available models")
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            models = response.json()
            logging.info(f"Successfully fetched {len(models)} models")
            model_dropdown['values'] = models
            if models:
                model_dropdown.set(models[0])
            chat_frame.grid()
            status_label.config(text="API Key validated successfully!")
        else:
            error_msg = f"Error fetching models: {response.text}"
            logging.error(error_msg)
            status_label.config(text=error_msg)
            chat_frame.grid_remove()
    except Exception as e:
        error_msg = f"Exception while fetching models: {str(e)}"
        logging.error(error_msg)
        status_label.config(text=f"Error: {str(e)}")
        chat_frame.grid_remove()

def submit_prompt():
    """Submit prompt to qBraid API"""
    prompt = prompt_entry.get().strip()
    if not prompt:
        logging.warning("Empty prompt submitted")
        status_label.config(text="Please enter a prompt.")
        return
    
    logging.info(f"Submitting prompt: {prompt[:50]}...")
    Thread(target=send_chat_request, args=(prompt,)).start()

def send_chat_request(prompt):
    """Send chat request to qBraid API"""
    try:
        url = "https://api.qbraid.com/api/chat"
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json"
        }
        payload = {"prompt": prompt}
        
        logging.info("Sending chat request to API")
        status_label.config(text="Sending request...")
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 200:
            logging.info("Successfully received chat response")
            update_chat_display(prompt, response.json())
            status_label.config(text="Response received!")
        else:
            error_msg = f"Error in chat request: {response.text}"
            logging.error(error_msg)
            status_label.config(text=f"Error: {response.text}")
    except Exception as e:
        error_msg = f"Exception in chat request: {str(e)}"
        logging.error(error_msg)
        status_label.config(text=f"Error: {str(e)}")

def update_chat_display(prompt, response):
    """Update chat display with new message"""
    try:
        chat_display.config(state=tk.NORMAL)
        chat_display.insert(tk.END, f"\nYou: {prompt}\n")
        
        # Extract and display only the "content" part of the response
        content = response.get("content", "No response content available.")
        chat_display.insert(tk.END, f"Assistant: {content}\n")
        
        chat_display.see(tk.END)
        chat_display.config(state=tk.DISABLED)
        prompt_entry.delete(0, tk.END)
        logging.info("Chat display updated successfully")
    except Exception as e:
        error_msg = f"Error updating chat display: {str(e)}"
        logging.error(error_msg)


def on_closing():
    """Handle application closing"""
    logging.info("Application shutting down")
    root.destroy()

# Create main window
root = tk.Tk()
root.title("qBraid Chat")
root.configure(background='#ffffff')
root.protocol("WM_DELETE_WINDOW", on_closing)

# Create main container
main_frame = ttk.Frame(root, padding="10")
main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

# API Key Entry Section
api_frame = ttk.Frame(main_frame)
api_frame.grid(row=0, column=0, pady=10, sticky=(tk.W, tk.E))

ttk.Label(api_frame, text="API Key:").grid(row=0, column=0, padx=5)
api_key_entry = ttk.Entry(api_frame, width=35)
api_key_entry.grid(row=0, column=1, padx=5)
api_key_entry.bind('<KeyRelease>', validate_api_key)

# Chat Interface Section (initially hidden)
chat_frame = ttk.Frame(main_frame)
chat_frame.grid(row=1, column=0, pady=10, sticky=(tk.W, tk.E))
chat_frame.grid_remove()

# Prompt entry
prompt_entry = ttk.Entry(chat_frame, width=40)
prompt_entry.grid(row=0, column=0, padx=5)

# Model selection dropdown
model_var = tk.StringVar()
model_dropdown = ttk.Combobox(chat_frame, textvariable=model_var, state='readonly', width=20)
model_dropdown.grid(row=0, column=1, padx=5)

# Submit button
submit_btn = ttk.Button(chat_frame, text="Submit", command=submit_prompt)
submit_btn.grid(row=0, column=2, padx=5)

# Chat display area
chat_display = tk.Text(main_frame, height=20, width=80, wrap=tk.WORD)
chat_display.grid(row=2, column=0, pady=10, sticky=(tk.W, tk.E))
chat_display.config(state=tk.DISABLED)

# Status label
status_label = ttk.Label(main_frame, text="")
status_label.grid(row=3, column=0, pady=5)

# Add log file location label
log_label = ttk.Label(main_frame, text=f"Log file: {log_filename}")
log_label.grid(row=4, column=0, pady=5)

if __name__ == "__main__":
    logging.info("Starting main application loop")
    root.mainloop()